const on = document.getElementById('on');
const fmt = document.getElementById('fmt');
const state = document.getElementById('state');
function show(v) { on.checked = v; state.textContent = v ? 'On' : 'Off'; }
chrome.storage.sync.get({ enabled: true, format: true }, (r) => {
  show(r.enabled !== false);
  fmt.checked = r.format !== false;
});
on.addEventListener('change', () => {
  show(on.checked);
  chrome.storage.sync.set({ enabled: on.checked });
});
fmt.addEventListener('change', () => chrome.storage.sync.set({ format: fmt.checked }));
fetch(chrome.runtime.getURL('model.json')).then((r) => r.json()).then((m) => {
  const n = (x) => x.toLocaleString();
  document.getElementById('stats').textContent =
    'Model: ' + n(m.phrases.length) + ' phrases, ' + n(m.words.length) + ' words';
}).catch(() => { document.getElementById('stats').textContent = 'Model: not found'; });
