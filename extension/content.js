/* CAN - content script. Ghost-text autocomplete for notes fields.
 * No network. Typed text is never stored. */
(function () {
  'use strict';
  if (window.__canLoaded || !window.CANSuggest || !window.CANFormat) return;
  window.__canLoaded = true;

  var enabled = true;
  var fmtOn = true;        // auto-format setting
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
  var cur = null;          // { field, before, after, sugg }
  var dismissed = null;    // field dismissed with Esc until next input
  var overlay = null;
  var useDebounce = false;
  var timer = 0;
  var raf = 0;

  // ---------- settings ----------
  function applyFormat(v) {
    fmtOn = v !== false;
    last = null;
    if (fmtOn) loadRules();
    if (cur) { var f = cur.field; hide(); update(f); }
  }
  try {
    chrome.storage.sync.get({ enabled: true, format: true }, function (r) {
      enabled = r.enabled !== false; if (!enabled) hide();
      applyFormat(r.format);
    });
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area !== 'sync') return;
      if (ch.enabled) { enabled = ch.enabled.newValue !== false; if (!enabled) hide(); }
      if (ch.format) applyFormat(ch.format.newValue);
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

  function loadModel() {
    if (model || modelLoading) return;
    modelLoading = true;
    loadFile('model.json', 'can-get-model', function (text) {
      try { model = JSON.parse(text); } catch (e) { model = null; }
      modelLoading = false;
      if (model && cur === null) { var f = document.activeElement; if (eligible(f)) update(f); }
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
      if (table && cur === null) { var f = document.activeElement; if (eligible(f)) update(f); }
    }, function () { rulesLoading = false; });
  }

  // ---------- fields ----------
  function eligible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.readOnly || el.disabled) return false;
    var tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t !== 'text' && t !== 'search') return false;
    if (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-autocomplete')) return false;
    return true;
  }

  function caretOk(f) {
    var s = f.selectionStart, e = f.selectionEnd;
    if (s == null || s !== e) return false;
    var c = f.value.charAt(s);
    return c === '' || c === '\n' || c === '\r';
  }

  // ---------- compute ----------
  function update(f) {
    if (!enabled || composing || !eligible(f) || document.activeElement !== f) return hide();
    if (!model) { loadModel(); return hide(); }
    if (dismissed === f) return hide();
    if (!f.value || !caretOk(f)) return hide();
    var before = f.value.slice(0, f.selectionStart);
    var t0 = performance.now();
    var s = window.CANSuggest.suggest(model, before);
    var dt = performance.now() - t0;
    useDebounce = dt > 5;
    if (!s) return hide();
    var disp = (fmtOn && casing) ? window.CANFormat.caseGhost(before, s, casing) : s;
    cur = { field: f, before: before, after: f.value.slice(f.selectionStart), sugg: s, disp: disp };
    render();
  }

  function schedule(f) {
    if (!useDebounce) return update(f);
    clearTimeout(timer);
    cur = null; hideOverlayOnly();
    timer = setTimeout(function () { update(f); }, 30);
  }

  // ---------- overlay ----------
  var COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
    'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'direction',
    'wordBreak', 'overflowWrap', 'tabSize', 'textRendering', 'fontKerning', 'fontFeatureSettings',
    'boxSizing', 'paddingTop', 'paddingLeft', 'paddingBottom', 'borderTopWidth', 'borderLeftWidth',
    'borderBottomWidth'];

  function ensureOverlay(host) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'can-ghost-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.appendChild(span('can-t'));
      overlay.appendChild(span('can-g'));
      overlay.appendChild(span('can-t'));
    }
    if (overlay.parentNode !== host) host.appendChild(overlay);
    return overlay;
  }
  function span(c) { var s = document.createElement('span'); s.className = c; return s; }

  function render() {
    if (!cur) return;
    var f = cur.field;
    if (!f.isConnected) return hide();
    var rect = f.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return hideOverlayOnly();
    var host = f.closest('dialog[open]') || document.body || document.documentElement;
    var ov = ensureOverlay(host);
    var cs = getComputedStyle(f);
    var st = ov.style;
    for (var i = 0; i < COPY.length; i++) st[COPY[i]] = cs[COPY[i]];
    var isTA = f.tagName === 'TEXTAREA';
    var bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    var sbw = Math.max(0, f.offsetWidth - f.clientWidth - bl - br);
    st.paddingRight = (parseFloat(cs.paddingRight) || 0) + sbw + 'px';
    st.borderRightWidth = cs.borderRightWidth;
    st.whiteSpace = isTA ? 'pre-wrap' : 'pre';
    if (isTA) {
      st.lineHeight = cs.lineHeight;
    } else {
      var ch = f.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      st.lineHeight = ch > 0 ? ch + 'px' : cs.lineHeight;
    }
    st.boxSizing = 'border-box';
    st.width = rect.width + 'px';
    st.height = rect.height + 'px';
    st.left = rect.left + 'px';
    st.top = rect.top + 'px';
    st.display = 'block';
    var kids = ov.childNodes;
    kids[0].textContent = cur.before;
    kids[1].textContent = cur.disp;
    kids[2].textContent = cur.after;
    ov.scrollTop = f.scrollTop;
    ov.scrollLeft = f.scrollLeft;
  }

  function hideOverlayOnly() { if (overlay) overlay.style.display = 'none'; }
  function hide() { cur = null; hideOverlayOnly(); }

  function reposition() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; if (cur) render(); });
  }

  // ---------- accept ----------
  function insert(f, s) {
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

  // Replace f.value[start, end) with text. Ctrl+Z still works (execCommand);
  // the native setter is the fallback. The caret goes to `caret`.
  function replaceRange(f, start, end, text, caret) {
    var v0 = f.value, want = v0.slice(0, start) + text + v0.slice(end);
    var prev = busy;
    busy = true;
    try {
      var ok = false;
      try { f.setSelectionRange(start, end); ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok || f.value !== want) setValue(f, want);
      f.setSelectionRange(caret, caret);
    } finally { busy = prev; }
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
    var ch = e.inputType === 'insertLineBreak' ? '\n'
      : (e.inputType === 'insertText' && e.data && e.data.length === 1 ? e.data : null);
    if (!ch || !window.CANFormat.isBoundary(ch)) return;
    var s = f.selectionStart;
    if (s == null || s !== f.selectionEnd || s < 2 || f.value.charAt(s - 1) !== ch) return;
    var ed = window.CANFormat.liveEdit(f.value.slice(0, s - 1), table, skips.get(f));
    if (!ed) return;
    var caret = s + ed.repl.length - (ed.end - ed.start);
    replaceRange(f, ed.start, ed.end, ed.repl, caret);
    last = { field: f, start: ed.start, orig: ed.orig, repl: ed.repl, key: ed.key, value: f.value, caret: caret };
  }

  // Backspace right after an auto-change: restore what the agent typed.
  function undoLast(e, f) {
    var L = last;
    if (!L || L.field !== f) return false;
    if (e.key !== 'Backspace' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
    if (f.selectionStart !== f.selectionEnd || f.selectionStart !== L.caret || f.value !== L.value) return false;
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
    var before = f.value.slice(0, f.selectionStart);
    var partial = /[A-Za-z0-9']*$/.exec(before)[0].length;
    var from = before.length - partial;
    busy = true;
    try { insert(f, s); } finally { busy = false; }
    if (fmtReady()) {
      var caret = f.selectionStart, v = f.value;
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
    touched.add(f);
    schedule(f);
  }

  // The field lost focus: format the whole note (pasted text, ALL CAPS).
  function blurFormat(f) {
    last = null;
    if (!fmtReady() || !touched.has(f) || !eligible(f)) return;
    var nv = window.CANFormat.formatNote(f.value, table, { skip: skips.get(f) });
    if (nv !== f.value) setValue(f, nv);
  }

  function nextWordPart(s) {
    var m = /^\s*\S+/.exec(s);
    return m ? m[0] : s;
  }

  // ---------- events ----------
  document.addEventListener('focusin', function (e) {
    var f = e.target;
    if (!eligible(f)) { hide(); return; }
    if (!model) loadModel();
    if (fmtOn && !table) loadRules();
    touched.delete(f); last = null;
    dismissed = null;
    update(f);
  }, true);

  document.addEventListener('focusout', function (e) {
    if (cur && e.target === cur.field) hide();
    if (dismissed === e.target) dismissed = null;
    if (eligible(e.target)) blurFormat(e.target);
  }, true);

  document.addEventListener('input', function (e) {
    var f = e.target;
    if (!eligible(f) || busy) return;
    if (e.isComposing || composing) { hide(); return; }
    dismissed = null;
    last = null;
    touched.add(f);
    liveFormat(e, f);
    schedule(f);
  }, true);

  document.addEventListener('compositionstart', function () { composing = true; hide(); }, true);
  document.addEventListener('compositionend', function (e) {
    composing = false;
    if (eligible(e.target)) schedule(e.target);
  }, true);

  document.addEventListener('keydown', function (e) {
    var f = e.target;
    if (e.isComposing) return;
    if (last) {
      if (undoLast(e, f)) return;
      if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta' && e.key !== 'CapsLock') last = null;
    }
    if (!cur || cur.field !== f) return;
    // Stale suggestion guard (debounce / external change).
    if (f.value.slice(0, f.selectionStart) !== cur.before) { update(f); if (!cur) return; }
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
  }, true);

  document.addEventListener('keyup', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' ||
        k === 'Home' || k === 'End') {
      var f = e.target;
      if (eligible(f)) { dismissed = null; update(f); }
    }
  }, true);

  document.addEventListener('mousedown', function (e) { last = null; if (cur && e.target === cur.field) hide(); }, true);
  document.addEventListener('mouseup', function (e) {
    if (eligible(e.target) && document.activeElement === e.target) update(e.target);
  }, true);

  document.addEventListener('scroll', function () { if (cur) reposition(); }, true);
  window.addEventListener('resize', reposition);
  if (typeof ResizeObserver === 'function') {
    var ro = new ResizeObserver(reposition);
    document.addEventListener('focusin', function (e) { if (eligible(e.target)) { ro.disconnect(); ro.observe(e.target); } }, true);
  }
})();
