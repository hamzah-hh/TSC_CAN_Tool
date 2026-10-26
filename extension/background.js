// CAN - background. Reads the bundled model.json for content scripts that
// cannot fetch it themselves (for example, strict page CSP). No network.
let cache = null;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'can-get-model') return false;
  (cache || (cache = fetch(chrome.runtime.getURL('model.json')).then((r) => r.text())))
    .then((text) => sendResponse({ ok: true, text }))
    .catch((e) => { cache = null; sendResponse({ ok: false, error: String(e) }); });
  return true;
});
