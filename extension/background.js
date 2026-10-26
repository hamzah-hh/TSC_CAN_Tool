// CAN - background. Reads the bundled model.json and formatting.json for content
// scripts that cannot fetch them themselves (for example, strict page CSP). No network.
const FILES = { 'can-get-model': 'model.json', 'can-get-formatting': 'formatting.json' };
const cache = {};
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const name = msg && FILES[msg.type];
  if (!name) return false;
  (cache[name] || (cache[name] = fetch(chrome.runtime.getURL(name)).then((r) => r.text())))
    .then((text) => sendResponse({ ok: true, text }))
    .catch((e) => { delete cache[name]; sendResponse({ ok: false, error: String(e) }); });
  return true;
});
