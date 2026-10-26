const on = document.getElementById('on');
const fmt = document.getElementById('fmt');
const dbg = document.getElementById('dbg');
const state = document.getElementById('state');
function show(v) { on.checked = v; state.textContent = v ? 'On' : 'Off'; }
chrome.storage.sync.get({ enabled: true, format: true, debug: false }, (r) => {
  show(r.enabled !== false);
  fmt.checked = r.format !== false;
  dbg.checked = r.debug === true;
});
on.addEventListener('change', () => {
  show(on.checked);
  chrome.storage.sync.set({ enabled: on.checked });
});
fmt.addEventListener('change', () => chrome.storage.sync.set({ format: fmt.checked }));
dbg.addEventListener('change', () => chrome.storage.sync.set({ debug: dbg.checked }));
fetch(chrome.runtime.getURL('model.json')).then((r) => r.json()).then((m) => {
  const n = (x) => x.toLocaleString();
  document.getElementById('stats').textContent =
    'Model: ' + n(m.phrases.length) + ' phrases, ' + n(m.words.length) + ' words';
}).catch(() => { document.getElementById('stats').textContent = 'Model: not found'; });

// ---- Last field: plain words. The record has no typed text, no value, no name or id. ----
function hostOf(o) { try { return new URL(o).host; } catch (e) { return String(o); } }
function yn(v) { return v ? 'yes' : 'no'; }

function fieldWords(f) {
  if (f.tag === 'input') return 'Text box (input, type ' + (f.type || 'text') + ')';
  if (f.tag === 'textarea') return 'Text area';
  return 'Editable box (' + f.tag + ', contenteditable ' + f.contentEditable + ')';
}

function renderLast(f) {
  const dl = document.getElementById('last');
  dl.textContent = '';
  const add = (k, v, cls) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    if (cls) dd.className = cls;
    dl.appendChild(dt); dl.appendChild(dd);
  };
  if (!f) { add('Status', 'No field yet. Click in a notes box first.'); return; }
  let when = f.time;
  try { when = new Date(f.time).toLocaleString(); } catch (e) { /* keep raw */ }
  add('Time', when);
  add('CAN version', f.version || '?');
  add('CAN can work here', f.eligible ? 'yes' : 'no', f.eligible ? 'yes' : 'no');
  if (!f.eligible) add('Reason', f.reason || '?');
  add('Field', fieldWords(f));
  if (f.role) add('Role', f.role);
  add('Frame', f.frameHost + (f.topFrame ? ' (main page)' : ' (inside a frame)'));
  if (f.ancestorOrigins && f.ancestorOrigins.length) add('Pages above', f.ancestorOrigins.map(hostOf).join(' > '));
  add('In shadow DOM', yn(f.inShadowDom));
  add('In dialog', yn(f.inDialog));
}

function load() { chrome.storage.local.get({ lastField: null }, (r) => renderLast(r.lastField)); }
load();
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.lastField) renderLast(ch.lastField.newValue); });
