# CAN — note autocomplete for LeadSquared

CAN is a Chrome extension. It shows grey "ghost text" while a call-center agent types follow-up notes in LeadSquared.

- Press **Tab** to accept the suggestion.
- Press **Ctrl+→** (or **Alt+→**) to accept one word.
- Press **Esc** to remove the suggestion.
- Keep typing to change the suggestion.
- Type a space after a short form (`cx`, `cb`). CAN changes it to the full form (`Customer`, `call back`). This is **auto-format**.
- Press **Backspace** right after a change to undo it.

CAN works offline. CAN does not send data. CAN does not save what agents type. All suggestions come from `extension/model.json`.

## Auto-format

Auto-format changes the note while the agent types. It uses the rules in `model/formatting.json`. The same file is in `extension/formatting.json`.

- The agent types a word and then a space, comma, full stop, `/`, `|`, `;`, `?`, `!` or a new line. CAN checks the last 3, 2, then 1 words. If the words match a rule, CAN replaces them. Example: `cx ` becomes `Customer `.
- CAN gives the first word of a note, of a line, of a sentence and after `/` or `|` a capital letter.
- The rules have three lists: `expand` (short form to full form), `casing` (exact capital letters of names, for example `SmartGRID`, `AeroPlus`, `Amazon`) and `corrections` (typo to word).
- **Backspace** right after a change brings back the original word. CAN does not change this word again in the same field.
- **Ctrl+Z** also works.
- When the agent accepts a suggestion with Tab or Ctrl+&rarr;, CAN formats the new words in the same way.
- The grey text shows the name casing (for example `rtGRID` after `sma`).
- When the agent leaves the field, CAN formats the whole note. This fixes pasted text and ALL CAPS notes. CAN does this only if the agent changed the field.
- The popup has a switch **Auto-format**. It is on by default.

### Change the rules

1. Edit `model/formatting.json`. All keys are lowercase. Do not delete the three lists.
2. Rebuild the model: `python model/build_model.py extension/model.json export.csv`
3. Copy the rules: `cp model/formatting.json extension/formatting.json`
4. Run the tests. Increase `version` in `extension/manifest.json`. Reload the extension.

To find new typos in the exports, run `python model/gen_corrections.py model/formatting.json export1.csv export2.csv`. The script adds typos that occur often. It keeps your entries. Read the new entries before you use them.

`model/fmt.py` is the reference formatter. `extension/formatter.js` must give the same result. `tests/format_cases.json` holds the test cases.

## Folders

| Folder | Content |
|---|---|
| `extension/` | The Chrome extension (Manifest V3). Load this folder in Chrome. |
| `model/` | `build_model.py` makes `model.json` from LeadSquared activity exports. `formatting.json` holds the auto-format rules. `fmt.py` is the reference formatter. `gen_corrections.py` finds typos. |
| `tests/` | Unit tests for suggestions and auto-format, and a browser test (Playwright). |

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
4. **Spelling.** Before the model is built, every note is formatted to lowercase full forms. Short forms (`cx`, `cb`, `rnr`) become full words. Typos (`matress`) become the right word. The model has no short forms.
5. **Privacy.** Parts with phone numbers, emails, order IDs or long numbers are removed.

## Rebuild the model

```bash
pip install pandas wordfreq
python model/build_model.py extension/model.json export1.csv export2.csv
cp model/formatting.json extension/formatting.json
```

Then increase `version` in `extension/manifest.json` and reload the extension.

## Tests

```bash
node tests/format.test.js      # auto-format logic
node tests/suggest.test.js     # suggestion logic
node tests/browser.test.js     # needs Playwright and Chromium
```

## Limits

- CAN works in plain text areas and text boxes. It does not work in rich-text editors (contenteditable).
- CAN shows a suggestion only when the cursor is at the end of the text.
- Auto-format works at word ends. It does not change a word that the agent does not finish with a boundary character, except when the field loses focus.
- A word typed in ALL CAPS gets the full form in capitals (`CX ` becomes `CUSTOMER `). The whole note gets normal letters when the field loses focus.
