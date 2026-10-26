/* CAN - content script. Ghost-text autocomplete for notes fields.
 * No network. Typed text is never stored.
 *
 * Works in: text boxes, text areas, contenteditable fields, fields inside open
 * shadow roots, fields inside modal <dialog> elements, pop-up windows and frames
 * (also about:blank, srcdoc and cross-origin frames). */
(function () {
  'use strict';
  if (window.__canLoaded || !window.CANSuggest || !window.CANFormat) return;
  window.__canLoaded = true;

  // ---------- frame guard ----------
  // CAN runs only in LeadSquared. The manifest also lists leadsquaredcdn.com and
  // lsqportal.com, because pop-up forms can come from there. A page on those
  // domains opened on its own (a customer portal) must stay off.
  // Tests rewrite the next line. Keep it on one line.
  var GUARD_DOMAINS = ['leadsquared.com'];

  function hostOk(h) {
    h = String(h || '').toLowerCase();
    if (!h) return false;
    for (var i = 0; i < GUARD_DOMAINS.length; i++) {
      var d = GUARD_DOMAINS[i];
      if (h === d || h.slice(-(d.length + 1)) === '.' + d) return true;
    }
    return false;
  }
  function hostOfUrl(u) {
    try { return new URL(u).hostname; } catch (e) { return ''; }
  }
  function frameAllowed() {
    try {
      if (hostOk(location.hostname)) return true;
      // blob: and similar pages keep the origin of their creator
      if (hostOk(hostOfUrl(location.origin))) return true;
    } catch (e) { /* ignore */ }
    try {
      var ao = location.ancestorOrigins;               // Chrome
      if (ao) for (var i = 0; i < ao.length; i++) if (hostOk(hostOfUrl(ao[i]))) return true;
    } catch (e) { /* ignore */ }
    try {                                              // same-origin parent / top (no ancestorOrigins)
      if (window.parent !== window && hostOk(window.parent.location.hostname)) return true;
    } catch (e) { /* cross-origin */ }
    try {                                              // pop-up window opened by LeadSquared
      if (window.opener && hostOk(window.opener.location.hostname)) return true;
    } catch (e) { /* cross-origin opener */ }
    try {
      if (document.referrer && hostOk(hostOfUrl(document.referrer))) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  // ---------- state ----------
  var enabled = true;
  var fmtOn = true;        // auto-format setting
  var debug = false;       // console.info of the "last field" record
  var model = null;
  var modelLoading = false;
  var table = null;        // formatting table (formatting.json)
  var casing = null;       // name casing map, for the ghost text
  var rulesLoading = false;
  var skips = new WeakMap();   // field -> Set of keys the agent undid
  var touched = new WeakSet(); // fields the agent changed since focus
  var last = null;         // last auto-change, for Backspace undo
  var busy = false;        // true while CAN changes a field itself
  var composing = false;
  var cur = null;          // { field, before, after, sugg, disp }
  var dismissed = null;    // field dismissed with Esc until next input
  var overlay = null;
  var useDebounce = false;
  var timer = 0;
  var raf = 0;
  var trackRaf = 0;
  var trackSig = '';
  var VERSION = '';
  try { VERSION = chrome.runtime.getManifest().version; } catch (e) { /* ignore */ }

  // ---------- event targets, shadow DOM ----------
  // The real target of an event, also when it comes from inside an open shadow root.
  function realTarget(e) {
    var p = null;
    try { p = e.composedPath(); } catch (x) { p = null; }
    return (p && p.length) ? p[0] : e.target;
  }

  function isCE(f) { return f.tagName !== 'INPUT' && f.tagName !== 'TEXTAREA'; }

  // The field for an event target. For contenteditable: the editing host.
  function fieldOf(t) {
    if (!t || t.nodeType !== 1) return null;
    var tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return t;
    if (t.isContentEditable) {
      var h = t;
      while (h.tagName !== 'BODY' && h.parentElement && h.parentElement.isContentEditable) h = h.parentElement;
      return h;
    }
    return t;
  }

  function deepActiveElement(doc) {
    var a = doc.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }

  function isActive(f) {
    var a = deepActiveElement(f.ownerDocument);
    return a === f || (isCE(f) && !!a && f.contains(a));
  }

  function getSel(f) {
    try {
      var r = f.getRootNode && f.getRootNode();
      if (r && r !== f.ownerDocument && typeof r.getSelection === 'function') return r.getSelection();
    } catch (e) { /* ignore */ }
    var w = f.ownerDocument.defaultView || window;
    return w.getSelection();
  }

  // Walk up the composed tree (through shadow roots).
  function upward(el, test) {
    var n = el;
    while (n) {
      if (n.nodeType === 1 && test(n)) return n;
      n = n.parentNode || n.host || null;
    }
    return null;
  }

  // ---------- field rules ----------
  // Returns null when CAN may work in the field, else the reason (plain words).
  function reasonFor(el) {
    if (!el || el.nodeType !== 1) return 'not a text field';
    var tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (el.readOnly) return 'read-only';
      if (el.disabled) return 'disabled';
      if (tag === 'INPUT') {
        var t = (el.getAttribute('type') || 'text').toLowerCase();
        if (t !== 'text' && t !== 'search') return 'type=' + t;
      }
    } else if (el.isContentEditable) {
      if (el.getAttribute('aria-readonly') === 'true') return 'read-only';
    } else {
      return el.contentEditable === 'false' ? 'contenteditable=false' : 'not a text field';
    }
    if ((el.getAttribute('role') || '').toLowerCase() === 'combobox') return 'combobox';
    var ac = el.getAttribute('aria-autocomplete');
    if (ac && ac.toLowerCase() !== 'none') return 'aria-autocomplete=' + ac;
    return null;
  }
  function eligible(el) { return reasonFor(el) === null; }

  // ---------- "last field" record (no typed text, no value, no name or id) ----------
  function candidate(t) {
    return !!t && t.nodeType === 1 && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function describeField(f, eligibleFlag, reason) {
    var root = null, inShadow = false, inDialog = false;
    try { root = f.getRootNode(); inShadow = !!(root && root !== f.ownerDocument && root.host); } catch (e) { /* ignore */ }
    try {
      inDialog = !!upward(f, function (n) {
        var r = (n.getAttribute('role') || '').toLowerCase();
        return n.tagName === 'DIALOG' || r === 'dialog' || r === 'alertdialog' || n.getAttribute('aria-modal') === 'true';
      });
    } catch (e) { /* ignore */ }
    var anc = [];
    try { var ao = location.ancestorOrigins; if (ao) for (var i = 0; i < ao.length; i++) anc.push(ao[i]); } catch (e) { /* ignore */ }
    var ce = 'no';
    try { if (f.isContentEditable) ce = f.contentEditable === 'inherit' ? 'inherited' : f.contentEditable; } catch (e) { /* ignore */ }
    var topFrame = true;
    try { topFrame = window === window.top; } catch (e) { topFrame = false; }
    return {
      time: new Date().toISOString(),
      version: VERSION,
      frameHost: location.host || '(about:blank/srcdoc)',
      topFrame: topFrame,
      ancestorOrigins: anc,
      tag: f.tagName.toLowerCase(),
      type: f.tagName === 'INPUT' ? (f.getAttribute('type') || 'text').toLowerCase() : '',
      role: f.getAttribute('role') || '',
      contentEditable: ce,
      inShadowDom: inShadow,
      inDialog: inDialog,
      eligible: !!eligibleFlag,
      reason: reason || ''
    };
  }

  function recordField(f, eligibleFlag, reason) {
    var obj;
    try { obj = describeField(f, eligibleFlag, reason); } catch (e) { return; }
    try { chrome.storage.local.set({ lastField: obj }); } catch (e) { /* extension context lost */ }
    if (debug) { try { console.info('[CAN]', obj); } catch (e) { /* ignore */ } }
  }

  // Record the field once per focus. Chrome sometimes sends no focusin when focus
  // moves inside a shadow root, so mouseup, keydown and input also call this.
  var lastRec = null;
  var blocked = false;
  function noteField(t, force) {
    if (!candidate(t)) return;
    var f = fieldOf(t);
    if (!force && f === lastRec) return;
    lastRec = f;
    var why = blocked ? 'frame not inside LeadSquared' : reasonFor(f);
    if (why === null && !enabled) why = 'CAN is turned off';
    recordField(f, why === null, why);
  }

  // ---------- blocked frame: record the field and do nothing else ----------
  if (!frameAllowed()) {
    blocked = true;
    try {
      chrome.storage.sync.get({ debug: false }, function (r) { debug = r.debug === true; });
      chrome.storage.onChanged.addListener(function (ch, area) {
        if (area === 'sync' && ch.debug) debug = ch.debug.newValue === true;
      });
    } catch (e) { /* ignore */ }
    window.addEventListener('focusin', function (e) { noteField(realTarget(e), true); }, true);
    window.addEventListener('focusout', function () { lastRec = null; }, true);
    window.addEventListener('mouseup', function (e) { noteField(realTarget(e), false); }, true);
    window.addEventListener('keydown', function (e) { noteField(realTarget(e), false); }, true);
    return;
  }

  // ---------- settings ----------
  function applyFormat(v) {
    fmtOn = v !== false;
    last = null;
    if (fmtOn) loadRules();
    if (cur) { var f = cur.field; hide(); update(f); }
  }
  try {
    chrome.storage.sync.get({ enabled: true, format: true, debug: false }, function (r) {
      enabled = r.enabled !== false; if (!enabled) hide();
      debug = r.debug === true;
      applyFormat(r.format);
    });
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area !== 'sync') return;
      if (ch.enabled) { enabled = ch.enabled.newValue !== false; if (!enabled) hide(); }
      if (ch.format) applyFormat(ch.format.newValue);
      if (ch.debug) debug = ch.debug.newValue === true;
    });
  } catch (e) { /* extension context lost */ }

  // ---------- data files ----------
  // Read a bundled JSON file. Try fetch first, then ask the background script.
  function loadFile(name, msgType, ok, fail) {
    var viaBackground = function () {
      try {
        chrome.runtime.sendMessage({ type: msgType }, function (r) {
          if (chrome.runtime.lastError || !r || !r.ok) { fail(); return; }
          ok(r.text);
        });
      } catch (e) { fail(); }
    };
    try {
      fetch(chrome.runtime.getURL(name))
        .then(function (r) { if (!r.ok) throw new Error('bad'); return r.text(); })
        .then(ok, viaBackground);
    } catch (e) { viaBackground(); }
  }

  function activeField() { return fieldOf(deepActiveElement(document)); }

  function loadModel() {
    if (model || modelLoading) return;
    modelLoading = true;
    loadFile('model.json', 'can-get-model', function (text) {
      try { model = JSON.parse(text); } catch (e) { model = null; }
      modelLoading = false;
      if (model && cur === null) { var f = activeField(); if (eligible(f)) update(f); }
    }, function () { modelLoading = false; });
  }

  function loadRules() {
    if (table || rulesLoading) return;
    rulesLoading = true;
    loadFile('formatting.json', 'can-get-formatting', function (text) {
      try {
        var j = JSON.parse(text);
        table = window.CANFormat.loadRules(j);
        casing = window.CANFormat.loadCasing(j);
      } catch (e) { table = null; casing = null; }
      rulesLoading = false;
      if (table && cur === null) { var f = activeField(); if (eligible(f)) update(f); }
    }, function () { rulesLoading = false; });
  }

  // ---------- contenteditable: text model ----------
  // The note is a string. <br> and block boundaries (div, p, li ...) are "\n".
  // A trailing <br> at the end of a line is only a placeholder: no "\n".
  var BLOCK = { DIV: 1, P: 1, LI: 1, UL: 1, OL: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    BLOCKQUOTE: 1, PRE: 1, TABLE: 1, TR: 1, TD: 1, TH: 1, SECTION: 1, ARTICLE: 1, HEADER: 1, FOOTER: 1 };

  function nextContent(n) {
    var s = n.nextSibling;
    while (s && s.nodeType === 3 && !s.data) s = s.nextSibling;
    return s;
  }
  function placeholderBr(br, host) {
    for (var x = br; x && x !== host; x = x.parentNode) {
      if (nextContent(x)) return false;
      if (x.parentNode && (x.parentNode === host || BLOCK[x.parentNode.tagName])) return true;
    }
    return true;
  }

  // Returns { text, caret, segs, marks }. caret = offset of (cn, co) in text, or -1.
  function linear(host, cn, co) {
    var out = '', caret = -1, segs = [], marks = [], needNl = false;
    function nl() { if (out && out.charAt(out.length - 1) !== '\n') out += '\n'; }
    function walk(n) {
      if (n.nodeType === 3) {
        var d = n.data.replace(/ /g, ' ');
        if (d && needNl) { nl(); needNl = false; }
        if (n === cn) caret = out.length + Math.min(co, d.length);
        segs.push({ node: n, start: out.length, len: d.length });
        out += d;
        return;
      }
      if (n.nodeType !== 1) return;
      var tag = n.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      if (tag === 'BR') {
        if (needNl) { nl(); needNl = false; }
        marks.push({ off: out.length, node: n.parentNode, offset: indexOf(n) });
        if (!placeholderBr(n, host)) out += '\n';
        return;
      }
      var blk = n !== host && BLOCK[tag];
      if (blk) { nl(); needNl = false; marks.push({ off: out.length, node: n, offset: 0 }); }
      var kids = n.childNodes;
      for (var i = 0; i < kids.length; i++) {
        if (n === cn && i === co) caret = out.length;
        walk(kids[i]);
      }
      if (n === cn && co >= kids.length) caret = out.length;
      if (blk) needNl = true;
    }
    walk(host);
    return { text: out, caret: caret, segs: segs, marks: marks };
  }
  function indexOf(n) {
    var i = 0;
    while ((n = n.previousSibling)) i++;
    return i;
  }

  function pointAt(a, o) {
    var i;
    for (i = 0; i < a.segs.length; i++) {
      var s = a.segs[i];
      if (o >= s.start && o <= s.start + s.len) return { node: s.node, offset: o - s.start };
    }
    for (i = 0; i < a.marks.length; i++) if (a.marks[i].off === o) return { node: a.marks[i].node, offset: a.marks[i].offset };
    return null;
  }

  // ---------- field access (input, textarea, contenteditable) ----------
  // Snapshot: { value, start, end }. start and end are null when there is no caret in the field.
  function snap(f) {
    if (!isCE(f)) return { value: f.value, start: f.selectionStart, end: f.selectionEnd };
    var sel = getSel(f);
    if (!sel || !sel.rangeCount) return { value: linear(f).text, start: null, end: null };
    var r = sel.getRangeAt(0);
    if (!f.contains(r.startContainer) || !f.contains(r.endContainer)) return { value: linear(f).text, start: null, end: null };
    var a = linear(f, r.startContainer, r.startOffset);
    var end = a.caret;
    if (!r.collapsed) end = linear(f, r.endContainer, r.endOffset).caret;
    return { value: a.text, start: a.caret < 0 ? null : a.caret, end: end < 0 ? null : end };
  }

  function setCaret(f, off) {
    if (!isCE(f)) { f.setSelectionRange(off, off); return; }
    var a = linear(f), p = pointAt(a, off), sel = getSel(f);
    if (!p || !sel) return;
    var r = f.ownerDocument.createRange();
    r.setStart(p.node, p.offset); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }

  function fireInput(f, type, data) {
    var ev;
    try { ev = new InputEvent('input', { bubbles: true, composed: true, inputType: type, data: data == null ? null : data }); }
    catch (e) { ev = new Event('input', { bubbles: true }); }
    f.dispatchEvent(ev);
  }

  // ---------- compute ----------
  function update(f) {
    if (!enabled || composing || !f || reasonFor(f) !== null || !isActive(f)) return hide();
    if (!model) { loadModel(); return hide(); }
    if (dismissed === f) return hide();
    var S = snap(f);
    if (!S.value || S.start == null || S.start !== S.end) return hide();
    var c = S.value.charAt(S.start);
    if (c !== '' && c !== '\n' && c !== '\r') return hide();
    var before = S.value.slice(0, S.start);
    var t0 = performance.now();
    var s = window.CANSuggest.suggest(model, before);
    var dt = performance.now() - t0;
    useDebounce = dt > 5;
    if (!s) return hide();
    var disp = (fmtOn && casing) ? window.CANFormat.caseGhost(before, s, casing) : s;
    cur = { field: f, before: before, after: S.value.slice(S.start), sugg: s, disp: disp };
    render();
  }

  function schedule(f) {
    if (!useDebounce) return update(f);
    clearTimeout(timer);
    cur = null; hideOverlayOnly();
    timer = setTimeout(function () { update(f); }, 30);
  }

  // ---------- overlay ----------
  // All critical styles are inline, because content.css does not reach into
  // shadow roots and a page style sheet may override it.
  var COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
    'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'direction',
    'wordBreak', 'overflowWrap', 'tabSize', 'textRendering', 'fontKerning', 'fontFeatureSettings',
    'boxSizing', 'paddingTop', 'paddingLeft', 'paddingBottom', 'borderTopWidth', 'borderLeftWidth',
    'borderBottomWidth'];
  var COPY_CE = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
    'letterSpacing', 'wordSpacing', 'textTransform', 'fontKerning', 'fontFeatureSettings', 'direction'];

  var BASE_CSS = 'position:fixed !important;left:0;top:0;margin:0 !important;' +
    'overflow:hidden !important;pointer-events:none !important;z-index:2147483647 !important;' +
    'background:transparent !important;color:transparent !important;border-style:solid !important;' +
    'border-color:transparent !important;border-width:0;outline:none !important;box-shadow:none !important;' +
    'transform:none !important;filter:none !important;opacity:1 !important;visibility:visible !important;' +
    'float:none !important;max-width:none !important;min-width:0 !important;min-height:0 !important;' +
    'user-select:none !important;-webkit-user-select:none !important;display:none;contain:none !important;';
  var SPAN_T = 'color:transparent !important;font:inherit !important;white-space:inherit !important;' +
    'letter-spacing:inherit !important;word-spacing:inherit !important;text-transform:inherit !important;' +
    'font-kerning:inherit !important;font-feature-settings:inherit !important;word-break:inherit !important;' +
    'overflow-wrap:inherit !important;tab-size:inherit !important;line-height:inherit !important;';
  var SPAN_G = SPAN_T.replace('color:transparent', 'color:#9aa0a6') + 'opacity:0.85 !important;';

  function span(c, css) {
    var s = document.createElement('span');
    s.className = c;
    s.style.cssText = css;
    return s;
  }

  function ensureOverlay(host) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'can-ghost-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.appendChild(span('can-t', SPAN_T));
      overlay.appendChild(span('can-g', SPAN_G));
      overlay.appendChild(span('can-t', SPAN_T));
    }
    // Last child, so that it wins over a later sibling with the same z-index.
    if (overlay.parentNode !== host || host.lastElementChild !== overlay) host.appendChild(overlay);
    return overlay;
  }

  // A modal <dialog> or a popover is in the top layer. Only its own children can be above it.
  function topLayerHost(f) {
    return upward(f, function (n) {
      if (n.tagName === 'DIALOG') return !!n.open;
      try { return n.matches(':popover-open'); } catch (e) { return false; }
    });
  }

  // Position of the text caret in a contenteditable. Viewport coordinates.
  function caretRect(f) {
    var sel = getSel(f);
    if (!sel || !sel.rangeCount) return null;
    var r0 = sel.getRangeAt(0);
    if (!r0.collapsed || !f.contains(r0.startContainer)) return null;
    var doc = f.ownerDocument, n = r0.startContainer, o = r0.startOffset, q, rc;
    var host = n.nodeType === 3 ? n.parentElement : n;
    function box(x, top, height) { return { x: x, top: top, height: height, el: host || f }; }
    var list = r0.getClientRects();
    if (list.length) { rc = list[list.length - 1]; if (rc.height > 0) return box(rc.left, rc.top, rc.height); }
    // the character before the caret, or the one after it
    var tn = null, at = 0;
    if (n.nodeType === 3) { tn = n; at = o; }
    else if (n.childNodes[o - 1] && n.childNodes[o - 1].nodeType === 3) { tn = n.childNodes[o - 1]; at = tn.data.length; }
    if (tn && tn.data.length) {
      var rr = doc.createRange();
      if (at > 0) {
        rr.setStart(tn, at - 1); rr.setEnd(tn, at);
        q = rr.getClientRects();
        if (q.length) { rc = q[q.length - 1]; if (rc.height > 0) return box(rc.right, rc.top, rc.height); }
      } else {
        rr.setStart(tn, 0); rr.setEnd(tn, 1);
        q = rr.getClientRects();
        if (q.length && q[0].height > 0) return box(q[0].left, q[0].top, q[0].height);
      }
    }
    // a temporary zero-width marker
    if (n.nodeType === 1 || n.nodeType === 3) {
      var mark = doc.createElement('span');
      mark.textContent = '​';
      var prev = busy; busy = true;
      try {
        var rm = r0.cloneRange();
        rm.insertNode(mark);
        var mr = mark.getBoundingClientRect();
        var res = mr.height > 0 ? box(mr.left, mr.top, mr.height) : null;
        var p = mark.parentNode;
        if (p) { p.removeChild(mark); p.normalize(); }
        // put the caret back where it was
        sel.removeAllRanges(); sel.addRange(r0);
        if (res) return res;
      } catch (e) { /* ignore */ } finally { busy = prev; }
    }
    // the content box of the element
    var el = host || f, cs = getComputedStyle(el), b = el.getBoundingClientRect();
    var lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 14) * 1.3;
    return box(b.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0),
      b.top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0), lh);
  }

  function render() {
    if (!cur) return;
    var f = cur.field;
    if (!f.isConnected) return hide();
    var rect = f.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return hideOverlayOnly();
    var host = topLayerHost(f) || document.body || document.documentElement;
    var ov = ensureOverlay(host);
    var kids = ov.childNodes;
    var st = ov.style;
    var wantL, wantT;
    st.cssText = BASE_CSS;
    if (isCE(f)) {
      var cr = caretRect(f);
      if (!cr) return hideOverlayOnly();
      var cs = getComputedStyle(cr.el);
      var fcs = getComputedStyle(f);
      for (var j = 0; j < COPY_CE.length; j++) st[COPY_CE[j]] = cs[COPY_CE[j]];
      var right = rect.right - (parseFloat(fcs.paddingRight) || 0) - (parseFloat(fcs.borderRightWidth) || 0);
      var w = Math.max(0, right - cr.x);
      if (w < 2) return hideOverlayOnly();
      st.setProperty('white-space', 'pre', 'important');
      st.setProperty('line-height', cr.height + 'px', 'important');
      st.setProperty('padding', '0', 'important');
      st.setProperty('width', w + 'px', 'important');
      st.setProperty('height', cr.height + 'px', 'important');
      wantL = cr.x; wantT = cr.top;
      kids[0].textContent = '';
      kids[2].textContent = '';
    } else {
      var cs2 = getComputedStyle(f);
      for (var i = 0; i < COPY.length; i++) st[COPY[i]] = cs2[COPY[i]];
      var isTA = f.tagName === 'TEXTAREA';
      var bl = parseFloat(cs2.borderLeftWidth) || 0, br = parseFloat(cs2.borderRightWidth) || 0;
      var sbw = Math.max(0, f.offsetWidth - f.clientWidth - bl - br);
      st.paddingRight = (parseFloat(cs2.paddingRight) || 0) + sbw + 'px';
      st.borderRightWidth = cs2.borderRightWidth;
      st.borderTopWidth = cs2.borderTopWidth;
      st.borderLeftWidth = cs2.borderLeftWidth;
      st.borderBottomWidth = cs2.borderBottomWidth;
      st.setProperty('white-space', isTA ? 'pre-wrap' : 'pre', 'important');
      if (isTA) {
        st.setProperty('line-height', cs2.lineHeight, 'important');
      } else {
        var ch = f.clientHeight - (parseFloat(cs2.paddingTop) || 0) - (parseFloat(cs2.paddingBottom) || 0);
        st.setProperty('line-height', ch > 0 ? ch + 'px' : cs2.lineHeight, 'important');
      }
      st.setProperty('box-sizing', 'border-box', 'important');
      st.setProperty('width', rect.width + 'px', 'important');
      st.setProperty('height', rect.height + 'px', 'important');
      wantL = rect.left; wantT = rect.top;
      kids[0].textContent = cur.before;
      kids[2].textContent = cur.after;
    }
    kids[1].textContent = cur.disp;
    st.setProperty('left', wantL + 'px', 'important');
    st.setProperty('top', wantT + 'px', 'important');
    st.setProperty('display', 'block', 'important');
    // A transformed ancestor makes "fixed" relative to that ancestor. Measure and correct.
    var got = ov.getBoundingClientRect();
    var dx = got.left - wantL, dy = got.top - wantT;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      st.setProperty('left', (wantL - dx) + 'px', 'important');
      st.setProperty('top', (wantT - dy) + 'px', 'important');
    }
    if (!isCE(f)) { ov.scrollTop = f.scrollTop; ov.scrollLeft = f.scrollLeft; }
    startTracking(f);
  }

  function hideOverlayOnly() { if (overlay) overlay.style.setProperty('display', 'none', 'important'); }
  function hide() { cur = null; hideOverlayOnly(); }

  function reposition() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; if (cur) render(); });
  }

  // While a ghost shows, follow the field: modals move (animation), scroll events
  // do not cross shadow roots.
  function sigOf(f) {
    var r = f.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height, f.scrollTop, f.scrollLeft].join(',');
  }
  function startTracking(f) {
    trackSig = sigOf(f);
    if (trackRaf) return;
    var tick = function () {
      trackRaf = 0;
      if (!cur) return;
      var s = cur.field.isConnected ? sigOf(cur.field) : '';
      if (s !== trackSig) { trackSig = s; render(); }
      if (cur) trackRaf = requestAnimationFrame(tick);
    };
    trackRaf = requestAnimationFrame(tick);
  }

  // ---------- accept ----------
  function insertCE(f, s) {
    var doc = f.ownerDocument, ok = false;
    var before = snap(f);
    try { ok = doc.execCommand('insertText', false, s); } catch (e) { ok = false; }
    var after = snap(f);
    if (ok && after.start != null && after.value.slice(0, after.start).slice(-s.length) === s) return;
    if (after.value !== before.value) return;       // something changed; do not insert twice
    var sel = getSel(f);
    if (!sel || !sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    r.deleteContents();
    var tn = doc.createTextNode(s);
    r.insertNode(tn);
    r.setStartAfter(tn); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    fireInput(f, 'insertText', s);
  }

  function insert(f, s) {
    if (isCE(f)) return insertCE(f, s);
    var ok = false;
    try { ok = document.execCommand('insertText', false, s); } catch (e) { ok = false; }
    if (ok && f.value.slice(0, f.selectionStart).slice(-s.length) === s) return;
    // Fallback: native setter + events (React / Angular).
    var start = f.selectionStart, end = f.selectionEnd;
    var proto = f.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    var v = f.value;
    if (v.slice(0, start).slice(-s.length) === s) return; // execCommand worked after all
    setter.call(f, v.slice(0, start) + s + v.slice(end));
    f.setSelectionRange(start + s.length, start + s.length);
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Replace the text [start, end) with text. Ctrl+Z still works (execCommand);
  // the native setter is the fallback. The caret goes to `caret`.
  function replaceRange(f, start, end, text, caret) {
    var prev = busy;
    busy = true;
    try {
      if (isCE(f)) { replaceRangeCE(f, start, end, text, caret); return; }
      var v0 = f.value, want = v0.slice(0, start) + text + v0.slice(end);
      var ok = false;
      try { f.setSelectionRange(start, end); ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok || f.value !== want) setValue(f, want);
      f.setSelectionRange(caret, caret);
    } finally { busy = prev; }
  }

  function replaceRangeCE(f, start, end, text, caret) {
    var doc = f.ownerDocument;
    var a = linear(f), p1 = pointAt(a, start), p2 = pointAt(a, end), sel = getSel(f);
    if (!p1 || !p2 || !sel) return;
    var want = a.text.slice(0, start) + text + a.text.slice(end);
    var r = doc.createRange();
    r.setStart(p1.node, p1.offset); r.setEnd(p2.node, p2.offset);
    sel.removeAllRanges(); sel.addRange(r);
    var ok = false;
    try { ok = text === '' ? doc.execCommand('delete') : doc.execCommand('insertText', false, text); } catch (e) { ok = false; }
    var b = linear(f);
    if ((!ok || b.text !== want) && b.text === a.text) {
      // execCommand did nothing: change the DOM by hand
      r.deleteContents();
      if (text) r.insertNode(doc.createTextNode(text));
      fireInput(f, 'insertReplacementText', text);
    }
    setCaret(f, caret);
  }

  function setValue(f, v) {
    var proto = f.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(f, v);
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- auto-format ----------
  function fmtReady() { return fmtOn && table && !composing; }

  // The agent typed boundary character e.data. Format the word(s) before it.
  function liveFormat(e, f) {
    if (!fmtReady()) return;
    var ch = (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') ? '\n'
      : (e.inputType === 'insertText' && e.data && e.data.length === 1 ? e.data : null);
    if (!ch || !window.CANFormat.isBoundary(ch)) return;
    var S = snap(f);
    var s = S.start;
    if (s == null || s !== S.end || s < 2 || S.value.charAt(s - 1) !== ch) return;
    var ed = window.CANFormat.liveEdit(S.value.slice(0, s - 1), table, skips.get(f));
    if (!ed) return;
    var caret = s + ed.repl.length - (ed.end - ed.start);
    replaceRange(f, ed.start, ed.end, ed.repl, caret);
    last = { field: f, start: ed.start, orig: ed.orig, repl: ed.repl, key: ed.key, value: snap(f).value, caret: caret };
  }

  // Backspace right after an auto-change: restore what the agent typed.
  function undoLast(e, f) {
    var L = last;
    if (!L || L.field !== f) return false;
    if (e.key !== 'Backspace' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
    var S = snap(f);
    if (S.start == null || S.start !== S.end || S.start !== L.caret || S.value !== L.value) return false;
    last = null;
    e.preventDefault(); e.stopImmediatePropagation();
    var set = skips.get(f);
    if (!set) { set = new Set(); skips.set(f, set); }
    set.add(L.key);
    // the Backspace removes the boundary character; the original text comes back
    replaceRange(f, L.start, L.start + L.repl.length + 1, L.orig, L.start + L.orig.length);
    schedule(f);
    return true;
  }

  // Accept a suggestion, then format the words it completed.
  function accept(f, s) {
    var S0 = snap(f);
    var before = S0.value.slice(0, S0.start);
    var partial = /[A-Za-z0-9']*$/.exec(before)[0].length;
    var from = before.length - partial;
    busy = true;
    try { insert(f, s); } finally { busy = false; }
    if (fmtReady()) {
      var S1 = snap(f);
      if (S1.start != null) {
        var caret = S1.start, v = S1.value;
        var head = v.slice(0, caret);
        var nh = window.CANFormat.formatFrom(head, from, table, skips.get(f));
        if (nh !== head) {
          var p = 0, m = Math.min(head.length, nh.length);
          while (p < m && head.charAt(p) === nh.charAt(p)) p++;
          var q = 0;
          while (q < m - p && head.charAt(head.length - 1 - q) === nh.charAt(nh.length - 1 - q)) q++;
          replaceRange(f, p, head.length - q, nh.slice(p, nh.length - q), nh.length);
        }
      }
    }
    touched.add(f);
    schedule(f);
  }

  // The field lost focus: format the whole note (pasted text, ALL CAPS).
  function blurFormat(f) {
    last = null;
    if (!f || !fmtReady() || !touched.has(f) || reasonFor(f) !== null) return;
    if (isCE(f)) return blurFormatCE(f);
    var nv = window.CANFormat.formatNote(f.value, table, { skip: skips.get(f) });
    if (nv !== f.value) setValue(f, nv);
  }

  // Only a plain contenteditable: text, <br>, and <div> lines that hold text.
  // Other markup (bold, links, lists) stays as it is.
  function plainCE(f) {
    var kids = f.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c.nodeType === 3 || (c.nodeType === 1 && c.tagName === 'BR')) continue;
      if (c.nodeType === 1 && c.tagName === 'DIV' && !c.attributes.length) {
        var g = c.childNodes, brs = 0;
        for (var j = 0; j < g.length; j++) {
          if (g[j].nodeType === 3) continue;
          if (g[j].nodeType === 1 && g[j].tagName === 'BR' && j === g.length - 1 && ++brs <= 1) continue;
          return false;
        }
        continue;
      }
      return false;
    }
    return true;
  }

  function blurFormatCE(f) {
    if (!plainCE(f)) return;
    var text = linear(f).text;
    var nv = window.CANFormat.formatNote(text, table, { skip: skips.get(f) });
    if (nv === text) return;
    // Not execCommand: it would select inside this field and take focus from the new one.
    var doc = f.ownerDocument, lines = nv.split('\n'), divMode = false, firstBare = true, i;
    for (i = 0; i < f.childNodes.length; i++) {
      var c = f.childNodes[i];
      if (c.nodeType === 1 && c.tagName === 'DIV') { divMode = true; if (i === 0) firstBare = false; }
    }
    var prev = busy; busy = true;
    try {
      while (f.firstChild) f.removeChild(f.firstChild);
      if (!divMode) {
        for (i = 0; i < lines.length; i++) {
          if (i) f.appendChild(doc.createElement('br'));
          if (lines[i]) f.appendChild(doc.createTextNode(lines[i]));
        }
        if (lines.length > 1 && lines[lines.length - 1] === '') f.appendChild(doc.createElement('br'));
      } else {
        for (i = 0; i < lines.length; i++) {
          if (i === 0 && firstBare) {
            f.appendChild(lines[0] ? doc.createTextNode(lines[0]) : doc.createElement('br'));
          } else {
            var d = doc.createElement('div');
            d.appendChild(lines[i] ? doc.createTextNode(lines[i]) : doc.createElement('br'));
            f.appendChild(d);
          }
        }
      }
      fireInput(f, 'insertReplacementText', null);
    } finally { busy = prev; }
  }

  function nextWordPart(s) {
    var m = /^\s*\S+/.exec(s);
    return m ? m[0] : s;
  }

  // ---------- events ----------
  // All listeners are on window, capture phase. They run before the listeners of
  // the page on document and below (modal focus traps). Events from open shadow
  // roots arrive here too; realTarget() gives the real element.
  var ro = null;
  if (typeof ResizeObserver === 'function') ro = new ResizeObserver(reposition);

  function onFocusIn(e) {
    var t = realTarget(e), f = fieldOf(t);
    noteField(t, true);
    if (!f || reasonFor(f) !== null) { hide(); return; }
    if (!model) loadModel();
    if (fmtOn && !table) loadRules();
    touched.delete(f); last = null;
    dismissed = null;
    if (ro) { ro.disconnect(); ro.observe(f); }
    update(f);
  }

  function onFocusOut(e) {
    var f = fieldOf(realTarget(e));
    lastRec = null;
    if (!f) return;
    if (cur && f === cur.field) hide();
    if (dismissed === f) dismissed = null;
    if (reasonFor(f) === null) blurFormat(f);
  }

  function onInput(e) {
    var f = fieldOf(realTarget(e));
    if (!f || reasonFor(f) !== null || busy) return;
    noteField(f, false);
    if (e.isComposing || composing) { hide(); return; }
    dismissed = null;
    last = null;
    touched.add(f);
    liveFormat(e, f);
    schedule(f);
  }

  function onKeyDown(e) {
    if (e.isComposing) return;
    var f = fieldOf(realTarget(e));
    noteField(f, false);
    if (last) {
      if (f && undoLast(e, f)) return;
      if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta' && e.key !== 'CapsLock') last = null;
    }
    // No ghost: do nothing. The page (modal, focus trap) keeps its normal behaviour.
    if (!cur || !f || cur.field !== f) return;
    // Stale suggestion guard (debounce / external change).
    var S = snap(f);
    if (S.start == null || S.value.slice(0, S.start) !== cur.before) { update(f); if (!cur) return; }
    var k = e.key;
    if (k === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      var s = cur.sugg; hide();
      accept(f, s);
      return;
    }
    if (k === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      dismissed = f; hide();
      return;
    }
    if (k === 'ArrowRight' && (e.ctrlKey || e.altKey) && !e.shiftKey && !e.metaKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      var part = nextWordPart(cur.sugg); hide();
      accept(f, part);
      return;
    }
  }

  function onKeyUp(e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' ||
        k === 'Home' || k === 'End') {
      var f = fieldOf(realTarget(e));
      if (f && eligible(f)) { dismissed = null; update(f); }
    }
  }

  function onCompStart() { composing = true; hide(); }
  function onCompEnd(e) {
    composing = false;
    var f = fieldOf(realTarget(e));
    if (f && eligible(f)) schedule(f);
  }
  function onMouseDown(e) {
    last = null;
    if (cur && fieldOf(realTarget(e)) === cur.field) hide();
  }
  function onMouseUp(e) {
    var f = fieldOf(realTarget(e));
    noteField(f, false);
    if (f && eligible(f) && isActive(f)) update(f);
  }
  function onScroll() { if (cur) reposition(); }

  // Add the listeners. Calling it again does nothing (same function, same phase).
  function arm() {
    window.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('input', onInput, true);
    window.addEventListener('compositionstart', onCompStart, true);
    window.addEventListener('compositionend', onCompEnd, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', reposition);
  }
  arm();

  // document.open() (document.write into an about:blank frame or pop-up window)
  // erases all event listeners of the window. A MutationObserver survives it.
  // When the document node gets new children, add the listeners again.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function () { arm(); hide(); }).observe(document, { childList: true });
  }
})();
