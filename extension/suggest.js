/* CAN - suggestion engine. Pure module. No DOM, no network.
 * Works in Node (module.exports) and in the browser (self.CANSuggest). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CANSuggest = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEP_RE = /\s*(?:\/+|\|+|;|\n|\r|,|\*|\.(?=\s|$)|\s-+\s|-{2,}|:-)\s*/gi;
  var TOKEN_RE = /[a-z0-9]+(?:['"x.][a-z0-9]+)*['"]?|&|\+/g;
  var MAX_LEN = 120;
  var EXTRA_WORDS = 4;
  var MIN_RATIO = 0.35;
  var MIN_COUNT = 20;

  // First index i such that arr[i][0] >= key.
  function lowerBound(arr, key) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (arr[mid][0] < key) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // Text after the last separator.
  function currentSegment(text) {
    var re = new RegExp(SEP_RE.source, 'gi');
    var m, end = 0;
    while ((m = re.exec(text)) !== null) {
      end = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    return text.slice(end);
  }

  function bestPrefix(list, prefix, mustBeLonger) {
    var i = lowerBound(list, prefix), best = null;
    for (; i < list.length; i++) {
      var t = list[i][0];
      if (t.lastIndexOf(prefix, 0) !== 0) break;
      if (mustBeLonger && t.length <= prefix.length) continue;
      if (best === null || list[i][1] > best[1]) best = list[i];
    }
    return best;
  }

  function pickFromNext(entry, partial) {
    if (!entry) return null;
    for (var i = 1; i < entry.length; i++) {
      var w = entry[i][0];
      if (w.length > partial.length && w.lastIndexOf(partial, 0) === 0) return w;
    }
    return null;
  }

  function limit(s) {
    if (s.length <= MAX_LEN) return s;
    var cut = s.slice(0, MAX_LEN);
    if (/\s/.test(s.charAt(MAX_LEN))) return cut.replace(/\s+$/, ' ');
    var sp = cut.lastIndexOf(' ');
    return sp > 0 ? cut.slice(0, sp) : cut;
  }

  /* model: parsed model.json. textBefore: field text before the caret.
   * Returns the suggestion string to append, or '' for none. */
  function suggest(model, textBefore) {
    if (!model || !textBefore) return '';
    var segOrig = currentSegment(textBefore).replace(/^\s+/, '');
    if (!segOrig) return '';
    var seg = segOrig.toLowerCase().replace(/\s+/g, ' ');
    var out = '';

    // 2. Phrase completion
    if (seg.length >= 2 && model.phrases) {
      var li = lowerBound(model.phrases, seg);
      var exact = (li < model.phrases.length && model.phrases[li][0] === seg) ? model.phrases[li] : null;
      var p = bestPrefix(model.phrases, seg, true);
      if (exact && (!p || p[1] < 0.5 * exact[1])) return ''; // complete common note: stay quiet
      if (p) out = p[0].slice(seg.length);
    }

    // 3. Word-level fallback
    if (!out) out = wordFallback(model, seg);

    if (!out) return '';
    out = limit(out);
    if (!out || !/\S/.test(out)) return '';

    // 5. Case matching
    var letters = segOrig.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 2 && letters === letters.toUpperCase()) out = out.toUpperCase();
    else out = out.toLowerCase();
    return out;
  }

  function wordFallback(model, seg) {
    var next = model.next || {};
    var tokens = [], m, lastEnd = -1;
    var re = new RegExp(TOKEN_RE.source, 'g');
    while ((m = re.exec(seg)) !== null) { tokens.push(m[0]); lastEnd = m.index + m[0].length; }
    if (!tokens.length) return '';
    var endsMid = lastEnd === seg.length;
    var comp = '';
    var ctx = tokens.slice();

    if (endsMid) {
      var partial = tokens[tokens.length - 1];
      var prev = tokens.slice(0, -1);
      var word = null;
      if (prev.length >= 2) word = pickFromNext(next[prev.slice(-2).join(' ')], partial);
      if (!word && prev.length >= 1) word = pickFromNext(next[prev[prev.length - 1]], partial);
      if (!word && partial.length >= 2 && model.words) {
        var b = bestPrefix(model.words, partial, true);
        if (b) word = b[0];
      }
      if (word) {
        comp = word.slice(partial.length);
        ctx[ctx.length - 1] = word;
      }
    }

    var extra = '';
    var lead = (comp === '' && seg.charAt(seg.length - 1) === ' ') ? '' : ' ';
    for (var n = 0; n < EXTRA_WORDS; n++) {
      var entry = null;
      if (ctx.length >= 2) entry = next[ctx[ctx.length - 2] + ' ' + ctx[ctx.length - 1]];
      if (!entry) entry = next[ctx[ctx.length - 1]];
      if (!entry || !entry[1]) break;
      var top = entry[1];
      if (!(entry[0] > 0 && top[1] / entry[0] >= MIN_RATIO && top[1] >= MIN_COUNT)) break;
      extra += (n === 0 ? lead : ' ') + top[0];
      ctx.push(top[0]);
    }
    return comp + extra;
  }

  return { suggest: suggest, currentSegment: currentSegment, SEP_RE: SEP_RE, TOKEN_RE: TOKEN_RE };
});
