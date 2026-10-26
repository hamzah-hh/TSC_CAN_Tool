# CAN

CAN shows grey ghost text while you type notes in LeadSquared.
CAN works offline. CAN does not send data. CAN does not save what you type.

## How to use CAN

- Type in a notes field. Grey text shows after the cursor.
- Press **Tab** to accept the grey text.
- Press **Ctrl+Right Arrow** (or **Alt+Right Arrow**) to accept one word.
- Press **Esc** to remove the grey text.
- Keep typing to change the grey text.
- Click the CAN icon to turn CAN on or off.

## Auto-format

Auto-format fixes your note while you type.

- Type a short form and press the space bar. CAN writes the full form. Example: `cx ` becomes `Customer `. `cb tomm ` becomes `call back tomorrow `.
- CAN writes names with the right capital letters. Example: `smartgrid` becomes `SmartGRID`.
- CAN writes a capital letter at the start of the note, of each line and of each sentence.
- Press **Backspace** right after a change. CAN brings back what you typed. CAN does not change that word again in the same field.
- Press **Ctrl+Z** to undo a change in the usual way.
- When you leave the field, CAN formats the whole note. This also fixes pasted text and notes in ALL CAPS.
- To turn it off, click the CAN icon and use the switch **Auto-format**.

To change the rules, see the top `README.md`.

## Install on one computer

1. Unzip `CAN-extension.zip` into a new folder with the name `CAN`. Keep the folder.
2. Open Chrome. Go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `CAN` folder.
6. Open LeadSquared. Reload the page.

Do not delete the folder. Chrome reads the files from it.

## Install on all agent computers (Google Admin)

Chrome needs a packed extension for this method.

1. In `chrome://extensions`, click **Pack extension**.
2. Select the `CAN` folder. Keep the `.pem` key file in a safe place.
3. Chrome makes a `.crx` file. Chrome shows the extension ID.
4. Put the `.crx` file and an `updates.xml` file on an internal web server (HTTPS).
5. Open Google Admin. Go to **Devices > Chrome > Apps & extensions > Users & browsers**.
6. Select the correct organization unit.
7. Click **Add** and choose **Add from a custom URL**. Enter the extension ID and the URL of `updates.xml`.
8. Set the install policy to **Force install**.
9. Save. Chrome installs CAN on each agent computer in a short time.

To update CAN, increase `version` in `manifest.json`. Pack again. Use the same `.pem` key. Update `updates.xml`.

You can also send the zip file to agents. They then use the steps in "Install on one computer".

## Update the model

1. Replace `model.json` in the folder with the new file. If the rules changed, replace `formatting.json` also.
2. Increase `version` in `manifest.json`.
3. Reload the extension in `chrome://extensions`.

## Where CAN works

CAN works in text areas and text boxes on `*.leadsquared.com`, also in frames.

CAN does not work in rich-text editors (contenteditable), password fields, or fields that have their own drop-down list.

## Files

- `manifest.json` - extension settings. Permission: `storage` only.
- `suggest.js` - the suggestion code.
- `formatter.js` - the auto-format code.
- `content.js`, `content.css` - the ghost text on the page.
- `background.js` - reads `model.json` and `formatting.json` when the page blocks direct reads.
- `popup.html`, `popup.js` - the on/off switches.
- `model.json` - the local data for suggestions.
- `formatting.json` - the local rules for auto-format.
- `icons/` - icons.

## Privacy

- CAN makes no network requests.
- CAN does not save typed text.
- CAN has no analytics.
- CAN saves only two settings: CAN on or off, and auto-format on or off.
