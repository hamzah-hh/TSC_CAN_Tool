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
- In a contenteditable box with bold text, links or lists, CAN does not format the whole note when you leave the field. This keeps your formatting. CAN still formats words while you type.
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

CAN works in these fields:

- Text boxes and text areas.
- Contenteditable boxes (some rich-text editors use them). Press **Tab** to accept, as in a text area.
- Fields inside a shadow root (web components). The shadow root must be open.

CAN works in these forms:

- Normal LeadSquared pages.
- Pop-up forms that show on top of the page (modal windows, `<dialog>` elements, pop-overs).
- Forms in frames (`iframe`). This includes frames from another domain, and `about:blank`, `srcdoc` and `blob:` frames.
- Pop-up browser windows that LeadSquared opens (`window.open`).

CAN does not work in:

- Password fields, e-mail fields, number fields and other special field types.
- Read-only and disabled fields.
- Fields with their own drop-down list (`role="combobox"` or `aria-autocomplete="list"`).
- Fields inside a closed shadow root. The page hides these fields from CAN.

When a ghost text shows, **Tab** and **Esc** go to CAN only. A pop-up form does not see these keys. The form does not close and the focus does not move. When no ghost text shows, **Tab** and **Esc** work as usual in the form.

## Domains and why

CAN runs on these domains:

| Domain | Why |
|---|---|
| `*.leadsquared.com` | The LeadSquared application. |
| `*.leadsquaredcdn.com` | LeadSquared can load pop-up forms from this domain. |
| `*.lsqportal.com` | LeadSquared can load pop-up forms from this domain. |

CAN does not run on `<all_urls>`.

A page on `leadsquaredcdn.com` or `lsqportal.com` that you open alone is not LeadSquared. It can be a customer portal. CAN stays off there. CAN starts on these two domains only when the page is inside LeadSquared. This means:

- The page is in a frame of a `leadsquared.com` page, or
- a `leadsquared.com` page opened the page as a pop-up window.

## If CAN does not work in a form

1. Click in the notes box.
2. Click the CAN icon.
3. Read the section **Last field**. It shows what CAN saw when you clicked:
   - **CAN can work here**: `yes` or `no`. When it is `no`, the line **Reason** tells why.
   - **Field**: text box, text area or editable box.
   - **Frame**: the domain of the frame, and if the field is in the main page or in a frame.
   - **Pages above**: the pages that hold the frame.
   - **In shadow DOM** and **In dialog**: `yes` or `no`.
4. Take a screenshot of the section **Last field**. Send it to the CAN owner.

**Last field** never shows what you typed. It does not show the field value, the field name or the field id. The record stays on your computer.

If you need more detail, do these steps:

1. Click the CAN icon. Turn on **Debug log**.
2. Press F12. Open the **Console**.
3. Click in the notes box. Find the lines that start with `[CAN]`.
4. Send a screenshot of these lines.
5. Turn off **Debug log** when you finish.

If the reason is `frame not inside LeadSquared`, the form is on a page that CAN does not trust. Send the screenshot. The owner can add the domain.

## Files

- `manifest.json` - extension settings. Permission: `storage` only.
- `suggest.js` - the suggestion code.
- `formatter.js` - the auto-format code.
- `content.js`, `content.css` - the ghost text on the page, the frame check and the **Last field** record.
- `background.js` - reads `model.json` and `formatting.json` when the page blocks direct reads.
- `popup.html`, `popup.js` - the on/off switches, the **Last field** section and the **Debug log** box.
- `model.json` - the local data for suggestions.
- `formatting.json` - the local rules for auto-format.
- `icons/` - icons.

## Privacy

- CAN makes no network requests.
- CAN does not save typed text.
- CAN has no analytics.
- CAN saves three settings: CAN on or off, auto-format on or off, and debug log on or off.
- CAN saves one record of the last field you clicked (**Last field**). The record has the field type, the frame domain and yes/no values. It has no text from the field. It stays in the browser of the agent.
