const F = require('../extension/formatter.js');
const rules = require('../model/formatting.json');
const cases = require('./format_cases.json');
const table = F.loadRules(rules);
let fail = 0;
function t(ok, label, extra) { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : extra || ''); }
for (const c of cases) {
  const out = F.formatNote(c.in, table);
  t(out === c.out, JSON.stringify(c.in), '\n  got  ' + JSON.stringify(out) + '\n  want ' + JSON.stringify(c.out));
  const lo = F.formatNote(c.in, table, { lower: true });
  t(lo === c.lower, 'lower ' + JSON.stringify(c.in), '\n  got  ' + JSON.stringify(lo) + '\n  want ' + JSON.stringify(c.lower));
}
// extension copy equals model copy
t(JSON.stringify(require('../extension/formatting.json')) === JSON.stringify(rules), 'extension/formatting.json equals model/formatting.json');
// skip set
t(F.formatNote('cx called', table, { skip: new Set(['cx']) }) === 'Cx called', 'skip key');
// live edits
function live(before, skip) { const e = F.liveEdit(before, table, skip); return e ? before.slice(0, e.start) + e.repl + before.slice(e.end) : null; }
t(live('cx') === 'Customer', 'live cx');
t(live('Customer cb tomm') === 'Customer cb tomorrow', 'live tomm only: ' + live('Customer cb tomm'));
t(live('sw off') === 'Switched off', 'live 2-word key');
t(live('hello') === 'Hello', 'live capital at note start');
t(live('ok. hello') === 'ok. Hello', 'live capital after full stop: ' + live('ok. hello'));
t(live('a / hello') === 'a / Hello', 'live capital after slash: ' + live('a / hello'));
t(live('x\nhello') === 'x\nHello', 'live capital after newline');
t(live('big hello') === null, 'live no change mid sentence');
t(live('cx', new Set(['cx'])) === null, 'live skip key: no change');
t(live('CX') === 'CUSTOMER', 'live all-caps stays caps');
t(live('buy amazon') === 'buy Amazon', 'live name casing');
t(live('a, ') === null, 'live needs word at end');
t(F.formatFrom('i will chk on amazon', 0, table) === 'I will check on Amazon', 'formatFrom');
t(F.formatFrom('i will chk on am' + 'azon', 14, table) === 'i will chk on Amazon', 'formatFrom partial start');
// ghost casing
const casing = F.loadCasing(rules);
t(F.caseGhost('sma', 'rtgrid', casing) === 'rtGRID', 'ghost smartgrid: ' + F.caseGhost('sma', 'rtgrid', casing));
t(F.caseGhost('am', 'azon', casing) === 'azon', 'ghost amazon');
t(F.caseGhost('from am', 'azon and', casing) === 'azon and', 'ghost amazon 2');
t(F.caseGhost('x', ' on sunday', casing) === ' on Sunday', 'ghost later word');
t(F.caseGhost('SMA', 'RTGRID', casing) === 'RTGRID', 'ghost all caps kept');
console.log(fail ? fail + ' FAILED' : 'ALL PASSED');
process.exit(fail ? 1 : 0);
