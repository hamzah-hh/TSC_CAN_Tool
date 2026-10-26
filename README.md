# CAN — note autocomplete for LeadSquared

CAN is a Chrome extension. It shows grey "ghost text" while a call-center agent types follow-up notes in LeadSquared.

- Press **Tab** to accept the suggestion.
- Press **Ctrl+→** (or **Alt+→**) to accept one word.
- Press **Esc** to remove the suggestion.
- Keep typing to change the suggestion.

CAN works offline. CAN does not send data. CAN does not save what agents type. All suggestions come from `extension/model.json`.

## Folders

| Folder | Content |
|---|---|
| `extension/` | The Chrome extension (Manifest V3). Load this folder in Chrome. |
| `model/` | `build_model.py` makes `model.json` from LeadSquared activity exports. |
| `tests/` | Unit tests for the suggestion logic and a browser test (Playwright). |

## Install

1. Open Chrome. Go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**. Select the `extension` folder.
4. Open LeadSquared. Reload the page.

For roll-out to all agents, see `extension/README.md`.

## How the suggestions work

The model comes from about 1 million Store Follow Up and HO Follow Up notes.

1. **Phrase completion.** Notes are split into parts at `/`, `|`, `,`, `;` and full stops. Parts that occur 5 or more times become phrases. CAN suggests the most frequent phrase that starts with the typed text.
2. **Next-word prediction.** If no phrase matches, CAN completes the current word and predicts up to 4 more words from word-pair statistics.
3. **Short notes.** If the typed text is already a frequent full note (for example `cb`), CAN does not suggest a less frequent, longer note.
4. **Spelling.** Typo variants (`rinigng`, `matress`) are removed. Agent short forms (`cx`, `cb`, `rnr`) stay.
5. **Privacy.** Parts with phone numbers, emails, order IDs or long numbers are removed.

## Rebuild the model

```bash
pip install pandas wordfreq
python model/build_model.py extension/model.json export1.csv export2.csv
```

Then increase `version` in `extension/manifest.json` and reload the extension.

## Tests

```bash
node tests/suggest.test.js     # suggestion logic
node tests/browser.test.js     # needs Playwright and Chromium
```

## Limits

- CAN works in plain text areas and text boxes. It does not work in rich-text editors (contenteditable).
- CAN shows a suggestion only when the cursor is at the end of the text.
