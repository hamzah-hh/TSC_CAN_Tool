/* CAN - content script. Ghost-text autocomplete for notes fields.
 * No network. Typed text is never stored. */
(function () {
  'use strict';
  if (window.__canLoaded || !window.CANSuggest) return;
  window.__canLoaded = true;

  var enabled = true;
  var model = null;
  var modelLoading = false;
  var composing = false;
  var cur = null;          // { field, before, after, sugg }
  var dismissed = null;    // field dismissed with Esc until next input
  var overlay = null;
  var useDebounce = false;
  var timer = 0;
  var raf = 0;

  // ---------- settings ----------
  try {
    chrome.storage.sync.get({ enabled: true }, function (r) { enabled = r.enabled !== false; if (!enabled) hide(); });
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'sync' && ch.enabled) { enabled = ch.enabled.newValue !== false; if (!enabled) hide(); }
    });
  } catch (e) { /* extension context lost */ }

  // ---------- model ----------
  function loadModel() {
    if (model || modelLoading) return;
    modelLoading = true;
    var done = function (text) {
      try { model = JSON.parse(text); } catch (e) { model = null; }
      modelLoading = false;
      if (model && cur === null) { var f = document.activeElement; if (eligible(f)) update(f); }
    };
    var viaBackground = function () {
      try {
        chrome.runtime.sendMessage({ type: 'can-get-model' }, function (r) {
          if (chrome.runtime.lastError || !r || !r.ok) { modelLoading = false; return; }
          done(r.text);
        });
      } catch (e) { modelLoading = false; }
    };
    try {
      fetch(chrome.runtime.getURL('model.json'))
        .then(function (r) { if (!r.ok) throw new Error('bad'); return r.text(); })
        .then(done, viaBackground);
    } catch (e) { viaBackground(); }
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
    cur = { field: f, before: before, after: f.value.slice(f.selectionStart), sugg: s };
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
    kids[1].textContent = cur.sugg;
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

  function nextWordPart(s) {
    var m = /^\s*\S+/.exec(s);
    return m ? m[0] : s;
  }

  // ---------- events ----------
  document.addEventListener('focusin', function (e) {
    var f = e.target;
    if (!eligible(f)) { hide(); return; }
    if (!model) loadModel();
    dismissed = null;
    update(f);
  }, true);

  document.addEventListener('focusout', function (e) {
    if (cur && e.target === cur.field) hide();
    if (dismissed === e.target) dismissed = null;
  }, true);

  document.addEventListener('input', function (e) {
    var f = e.target;
    if (!eligible(f)) return;
    if (e.isComposing || composing) { hide(); return; }
    dismissed = null;
    schedule(f);
  }, true);

  document.addEventListener('compositionstart', function () { composing = true; hide(); }, true);
  document.addEventListener('compositionend', function (e) {
    composing = false;
    if (eligible(e.target)) schedule(e.target);
  }, true);

  document.addEventListener('keydown', function (e) {
    var f = e.target;
    if (!cur || cur.field !== f || e.isComposing) return;
    // Stale suggestion guard (debounce / external change).
    if (f.value.slice(0, f.selectionStart) !== cur.before) { update(f); if (!cur) return; }
    var k = e.key;
    if (k === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      var s = cur.sugg; hide();
      insert(f, s);
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
      insert(f, part);
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

  document.addEventListener('mousedown', function (e) { if (cur && e.target === cur.field) hide(); }, true);
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
