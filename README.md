<p align="center">
  <img src="./assets/phronon-readme-header.png" alt="Phronon header" width="100%" />
</p>

<h1 align="center">Phronon</h1>

<p align="center">
  <strong>An open-source desktop application designed to help blind and low-vision students read, listen to, and navigate study materials independently.</strong>
</p>

---

## 🎯 Mission
Help students access and understand study material independently through a keyboard-first, screen-reader-friendly desktop application.

## ♿ Accessibility Principles
- **Keyboard-first navigation:** Every action is accessible without a mouse.
- **Clear headings and labels:** Designed for flawless screen-reader compatibility.
- **Visible focus states:** High-contrast indicators for sighted keyboard users.
- **Predictable layout:** Consistent, calm interface with minimal visual noise.

---

## ✨ Features & Capabilities (v0.1)

### 📄 Smart Document Loading
Easily open plain text (`.txt`) and PDF files directly from the Reader screen. Phronon intelligently extracts text from standard PDFs natively, without relying on external packages. For scanned or image-only PDFs, it seamlessly falls back to local OCR (Optical Character Recognition) to ensure no content is left behind.

### 🎧 Natural Text-to-Speech Playback
Listen to your documents with built-in text-to-speech. Phronon detects the script of your document and automatically selects the best available system voice, including smart language switching for Arabic text. Adjust reading speed on the fly, pause, stop, or repeat paragraphs with ease.

### 🔍 Seamless In-Document Search
Find what you need instantly. A compact, accessible search tool lets you jump directly to specific keywords or phrases. Search results are integrated with your study tools, showing match counts alongside your saved highlights and bookmarks.

### 🖍️ Inline Highlights & Bookmarks
Keep track of important concepts by selecting text and adding short, inline notes. Highlights and paragraph bookmarks are anchored securely to their positions and automatically restore whenever you reopen the document.

### ⌨️ Comprehensive Keyboard Controls
Navigate the entire app without a mouse. Phronon uses a unified, predictable keyboard shortcut system:
- **`Space`**: Play or pause reading
- **`J` / `K`**: Navigate to next/previous paragraph
- **`R`**: Repeat current paragraph
- **`M`**: Save a bookmark for the current paragraph
- **`B` / `Shift+B`**: Navigate between saved bookmarks
- **`H` / `Shift+H`**: Navigate between saved highlights
- **`Alt+Up` / `Alt+Down`**: Adjust playback speed
- **`Ctrl+F` / `/`**: Search the document

### 🎙️ Voice Command Navigation
Need hands-free control? Phronon offers an optional voice-command integration. Just press "Listen for command" and say *"play"*, *"pause"*, *"next paragraph"*, or *"faster"* to navigate your document. Voice commands are strictly on-demand, ensuring your privacy.

### 💾 Auto-Saving & Study Persistence
Never lose your place. Phronon automatically remembers your recent documents, current reading position, custom reading speed, and display preferences. Close the app anytime—your study context will be restored precisely when you return.

### 👁️ Low-Vision Display Settings
Customize the interface to suit your visual needs. Adjust global text size, reader-specific text size, and toggle a stronger contrast mode to make surfaces, borders, and text easier to distinguish—all without breaking the clean, calm layout.

---

## 🛠️ Project Structure

```text
Phronon/
├── apps/
│   └── desktop/    # Electron + React desktop application
├── backend/        # Python backend scaffold (for PDF/OCR processing)
├── docs/           # Vision, roadmaps, and release guides
└── scripts/        # Local development helpers
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 20+
- **npm** 10+
- **Python** 3.11+

### Installation
From the repository root, install the necessary dependencies:

```bash
npm install
python -m pip install -e ./backend
```

**Optional:** To enable OCR fallback for scanned or image-only PDFs, install the backend OCR extras:
```bash
python -m pip install -e "./backend[ocr]"
```
*Note: Phronon's OCR fallback also requires a local [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) installation available on your system path. The backend defaults to `eng+ara` OCR languages, which you can override locally with the `PHRONON_OCR_LANGUAGES` environment variable.*

### Running the App
Start the React renderer and open the Electron window:
```bash
npm run dev
```

*(Optional)* Run the backend placeholder manually:
```bash
python -m phronon_backend
```

---

## 📦 Building & Releases

### Build the Desktop App
```bash
npm run build
```

### Windows Releases
Phronon supports two Windows release formats without changing the app itself. From the repository root:

- **Portable App (Unpacked Folder):**
  ```bash
  npm run release:win
  ```
- **Standard Windows Installer:**
  ```bash
  npm run release:win:installer
  ```
- **Build Both:**
  ```bash
  npm run release:win:all
  ```

For detailed release notes and testing steps, see the [Windows Release Guide](./docs/windows-release.md).

---

## 🧪 Manual Test Steps

<details>
<summary><strong>Click to expand the full list of manual testing steps</strong></summary>

1. Run `npm run dev` from the repository root.
2. Run `python -m pip install -e ./backend` from the repository root if you have not installed the backend dependency yet.
3. Open the `Reader` screen in the desktop app.
4. Select `Open .txt or .pdf file` and choose a plain text `.txt` file.
5. Confirm the text appears in the reader area.
6. Press `Play` and confirm the text is spoken aloud.
7. Press `Pause` and confirm speech pauses.
8. Press `Play` again and confirm playback resumes.
9. Press `Stop` and confirm speech is canceled.
10. Press `Ctrl+O` while the Reader is active and confirm the native document picker opens.
11. Press `Space` while the Reader is active and confirm it starts from the highlighted paragraph, then toggles between play and pause.
12. Press `S` while speech is playing or paused and confirm playback stops without overlapping speech.
13. Open a text-based `.pdf` file and confirm extracted text appears in the same reader area without triggering OCR.
14. Press `Play` and confirm the extracted PDF text is read aloud.
15. Confirm the Reader status announces the current paragraph position, such as `Paragraph 1 of Y`.
16. Press `J` and confirm the current paragraph moves forward and the highlighted paragraph updates.
17. Press `K` and confirm the current paragraph moves backward and the highlighted paragraph updates.
18. Press `R` and confirm only the highlighted paragraph is read from its beginning.
19. Enter a word that appears in the current document, press `Search`, and confirm the Reader reports the total match count and jumps to a matching paragraph.
20. Press `F3` and `Shift+F3` after searching and confirm the current paragraph moves to the expected result while bookmarks and paragraph navigation still work.
21. Search for a word that is not present and confirm the Reader announces that no matches were found without changing the document text or playback controls.
22. Press `Ctrl+F` or `/` while focus is outside other controls and confirm the Reader search field is focused without opening a separate browser-style find UI.
23. Save a bookmark for the current paragraph with `M` or the button, add a short note, and confirm the saved marker shows both the paragraph preview and the note.
24. Press `B` and `Shift+B` to move between saved bookmarks and confirm the Reader jumps to the expected saved paragraph.
25. Jump to that saved bookmark, confirm the note is loaded back into the compact note field, update it, save again, and confirm the note text changes.
26. Select a word or short phrase inside one paragraph, enter an optional note in `Short note for this highlight`, press `Save highlight`, and confirm the selected text becomes visibly highlighted inline.
27. Press `H` and `Shift+H` to move between saved highlights and confirm the Reader jumps to the expected highlighted paragraph and loads its note.
28. Click the saved highlight in the highlights list, update its note, save again, and confirm the note text updates without affecting playback or search.
29. Restart the app, reopen the same document if needed, and confirm the bookmark note, inline highlight, and highlight note are still present.
30. Remove that highlight from the highlights panel and confirm the inline highlight disappears while the document still reads normally.
31. If local OCR dependencies are installed, open a scanned PDF or an image-only PDF and confirm Phronon extracts readable text through the same Reader view.
32. Open a document containing Arabic text and confirm Phronon prefers an Arabic-capable voice when the system reports one.
33. On a system without an Arabic speech voice, open Arabic text and confirm playback still starts while the Reader explains that Arabic playback may sound incorrect.
34. Open `Settings`, switch `Speech voice mode` between `Automatic` and `Always use default voice`, and confirm the choice persists after restarting the app.
35. If local OCR dependencies are not installed, open a scanned PDF or an image-only PDF and confirm Phronon shows a clear message explaining which local OCR tools are missing.
36. Move focus to the reading speed slider, search field, bookmark note field, and highlight note field. Press `Ctrl+O`, `Ctrl+F`, `Space`, `S`, `J`, `K`, `R`, `M`, `B`, `H`, `F3`, `Alt+Up`, and `Alt+Down`; confirm the shortcut does not fire and the focused control keeps its normal behavior.
37. While playback is active, change the reading speed slider or press `Alt+Up` or `Alt+Down` and confirm the status says the new speed will apply on the next paragraph without restarting the current paragraph immediately.
38. Pause playback, change the reading speed, press `Play`, and confirm playback resumes from the current paragraph at the new speed.
39. With speech recognition support available, press `Listen for command`, say `play`, `pause`, `stop`, `next paragraph`, `previous paragraph`, `repeat paragraph`, `faster`, `slower`, and `open file`, and confirm each command maps to the same Reader behavior as the matching button or shortcut.
40. If speech recognition support is unavailable or microphone permission is denied, confirm the Reader shows a clear message and no existing controls break.
41. With no file loaded, press `Play`, `Space`, `R`, `Ctrl+F`, or `M` and confirm the app shows a clear status message.
42. Open a document, move to a later paragraph, change the reading speed, restart the app, and confirm the recent list and reading speed are restored.
43. If the same document still exists, confirm it reopens and the highlighted paragraph returns to the saved position.
44. Rename or remove the last opened file, restart the app, and confirm Phronon stays usable while showing a clear load failure.
45. Open `Settings`, change `App text size`, `Reader text size`, and `Contrast`, then restart the app and confirm those display preferences persist.
46. With larger Reader text enabled, confirm the Reader layout still wraps cleanly, the current paragraph highlight stays visible, and playback controls remain usable.
47. With `Stronger contrast` enabled, confirm focus outlines, status regions, and the current paragraph are easier to distinguish without changing keyboard or playback behavior.

</details>

---

## 🗺️ Next Steps
- Add a comprehensive local text extraction pipeline
- Expand persistence coverage only when it improves accessibility and remains easy to maintain
