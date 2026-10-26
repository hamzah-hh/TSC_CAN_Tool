/* CAN - note formatter. Pure module. No DOM, no network.
 * Works in Node (module.exports) and in the browser (self.CANFormat).
 * formatNote() must give the same result as model/fmt.py format_note(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CANFormat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_KEY_WORDS = 3;
  var WORD_SRC = "[A-Za-z0-9]+(?:'[A-Za-z]+)?";
  var BOUNDARY = ' ,.;/|\n?!';

  function lowerKeys(obj) {
    var o = Object.create(null);
    if (obj) Object.keys(obj).forEach(function (k) { o[k.toLowerCase()] = obj[k]; });
    return o;
  }

  /* rules: parsed formatting.json. Order: casing < corrections < expand. */
  function loadRules(rules) {
    var table = Object.create(null);
    var casing = lowerKeys(rules && rules.casing);
    Object.keys(casing).forEach(function (k) { table[k] = casing[k]; });
    var corr = (rules && rules.corrections) || {};
    Object.keys(corr).forEach(function (k) {
      var v = corr[k];
      var c = casing[String(v).toLowerCase()];
      table[k.toLowerCase()] = c !== undefined ? c : v;
    });
    var exp = (rules && rules.expand) || {};
    Object.keys(exp).forEach(function (k) { table[k.toLowerCase()] = exp[k]; });
    return table;
  }

  function loadCasing(rules) { return lowerKeys(rules && rules.casing); }

  function replaceWords(text, table, skip) {
    var re = new RegExp(WORD_SRC, 'g'), words = [], m;
    while ((m = re.exec(text)) !== null) words.push({ s: m.index, e: m.index + m[0].length, t: m[0] });
    var out = [], pos = 0, i = 0;
    while (i < words.length) {
      var hit = null;
      for (var n = Math.min(MAX_KEY_WORDS, words.length - i); n >= 1; n--) {
        var ok = true;
        for (var j = 0; j < n - 1; j++) {
          var gap = text.slice(words[i + j].e, words[i + j + 1].s);
          if (gap === '' || gap.replace(/ /g, '') !== '') { ok = false; break; }
        }
        if (!ok) continue;
        var key = words.slice(i, i + n).map(function (w) { return w.t.toLowerCase(); }).join(' ');
        if (key in table && !(skip && skip.has(key))) {
          hit = { s: words[i].s, e: words[i + n - 1].e, v: table[key], n: n };
          break;
        }
      }
      if (hit) {
        out.push(text.slice(pos, hit.s), hit.v);
        pos = hit.e;
        i += hit.n;
      } else i++;
    }
    out.push(text.slice(pos));
    return out.join('');
  }

  function mostlyCaps(text) {
    var letters = text.match(/\p{L}/gu) || [];
    if (letters.length < 4) return false;
    var up = 0;
    for (var i = 0; i < letters.length; i++) {
      var c = letters[i];
      if (c !== c.toLowerCase() && c === c.toUpperCase()) up++;
    }
    return up / letters.length > 0.6;
  }

  /* opts.skip: Set of lowercase keys not to replace. opts.lower: model build mode. */
  function formatNote(text, table, opts) {
    opts = opts || {};
    if (!text) return text;
    if (opts.lower) {
      var lt = Object.create(null);
      Object.keys(table).forEach(function (k) { lt[k] = String(table[k]).toLowerCase(); });
      return replaceWords(text.toLowerCase(), lt, opts.skip);
    }
    if (mostlyCaps(text)) text = text.toLowerCase();
    text = replaceWords(text, table, opts.skip);
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/ +([,.?!])/g, '$1');
    text = text.replace(/,(?=[A-Za-z])/g, ', ');
    text = text.split('\n').map(function (l) { return l.trim(); }).join('\n');
    text = text.replace(/(^|\n\s*|[.?!]\s+|[/|]+\s*)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    return text;
  }

  // ---------- live typing ----------
  function isBoundary(ch) { return ch.length === 1 && BOUNDARY.indexOf(ch) >= 0; }

  function startsSentence(before, ws) {
    return /(^|\n[ \t]*|[.?!]\s+|[/|]+\s*)$/.test(before.slice(0, ws));
  }

  function isAllCaps(s) {
    var l = s.replace(/[^A-Za-z]/g, '');
    return l.length >= 2 && l === l.toUpperCase();
  }

  /* before: the text before the caret, WITHOUT the boundary character.
   * If it ends with a finished word, returns {start, end, orig, repl, key} (positions in
   * `before`) or null. key is the lowercase table key or, for a capital letter only, the word. */
  function liveEdit(before, table, skip) {
    if (!before || !/[A-Za-z0-9]$/.test(before)) return null;
    var t = Math.max(0, before.length - 160);
    var re = new RegExp(WORD_SRC, 'g'), ws = [], m;
    re.lastIndex = t;
    while ((m = re.exec(before.slice(0, before.length))) !== null) ws.push({ s: m.index, e: m.index + m[0].length, t: m[0] });
    if (t > 0 && ws.length && /[A-Za-z0-9']/.test(before.charAt(t - 1)) && ws[0].s === t) ws.shift();
    if (!ws.length || ws[ws.length - 1].e !== before.length) return null;
    var found = null;
    for (var n = Math.min(MAX_KEY_WORDS, ws.length); n >= 1 && !found; n--) {
      var span = ws.slice(ws.length - n), ok = true;
      for (var j = 0; j < n - 1; j++) {
        var gap = before.slice(span[j].e, span[j + 1].s);
        if (gap === '' || gap.replace(/ /g, '') !== '') { ok = false; break; }
      }
      if (!ok) continue;
      var key = span.map(function (w) { return w.t.toLowerCase(); }).join(' ');
      if (key in table && !(skip && skip.has(key))) {
        var s = span[0].s, orig = before.slice(s, before.length), repl = table[key];
        if (isAllCaps(orig)) repl = repl.toUpperCase();
        if (repl !== orig) found = { start: s, end: before.length, orig: orig, repl: repl, key: key };
        else found = { none: true };
      }
    }
    if (found && found.none) return capOnly(before, ws[ws.length - 1], null, skip);
    if (found) {
      if (startsSentence(before, found.start) && /^[a-z]/.test(found.repl)) found.repl = found.repl.charAt(0).toUpperCase() + found.repl.slice(1);
      return found;
    }
    return capOnly(before, ws[ws.length - 1], null, skip);
  }

  function capOnly(before, w, x, skip) {
    if (!/^[a-z]/.test(w.t) || !startsSentence(before, w.s)) return null;
    var key = w.t.toLowerCase();
    if (skip && skip.has(key)) return null;
    return { start: w.s, end: w.e, orig: w.t, repl: w.t.charAt(0).toUpperCase() + w.t.slice(1), key: key };
  }

  /* After a suggestion was accepted. text: whole field value. from: index where the word
   * being typed starts. Applies liveEdit to every word that starts at or after `from`.
   * Returns the new text. */
  function formatFrom(text, from, table, skip) {
    var pos = from, guard = 0;
    for (;;) {
      var re = new RegExp(WORD_SRC, 'g');
      re.lastIndex = pos;
      var m = re.exec(text);
      if (!m || ++guard > 200) break;
      var end = m.index + m[0].length;
      var e = liveEdit(text.slice(0, end), table, skip);
      if (e) {
        text = text.slice(0, e.start) + e.repl + text.slice(e.end);
        end = e.start + e.repl.length;
      }
      pos = end;
    }
    return text;
  }

  /* Display form of a suggestion: name casing on the suggested characters. */
  function caseGhost(before, sugg, casing) {
    if (!sugg || !casing) return sugg;
    if (/[A-Z]/.test(sugg) && sugg === sugg.toUpperCase()) return sugg;
    var full = before + sugg, b = before.length, out = sugg.split('');
    var re = new RegExp(WORD_SRC, 'g'), m;
    while ((m = re.exec(full)) !== null) {
      var s = m.index, e = s + m[0].length;
      if (e <= b) continue;
      var form = casing[m[0].toLowerCase()];
      if (form === undefined || form.length !== m[0].length) continue;
      for (var i = Math.max(s, b); i < e; i++) out[i - b] = form.charAt(i - s);
    }
    return out.join('');
  }

  return {
    loadRules: loadRules, loadCasing: loadCasing, formatNote: formatNote,
    liveEdit: liveEdit, formatFrom: formatFrom, caseGhost: caseGhost,
    isBoundary: isBoundary, BOUNDARY: BOUNDARY
  };
});
