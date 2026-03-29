<p align="center">
  <img src="./assets/phronon-readme-header.png" alt="Phronon header" width="100%" />
</p>

# Phronon

Phronon is an open-source desktop application designed to help blind and low-vision students read, listen to, and navigate study materials independently.

## What is Phronon?

Phronon is an accessibility-first desktop application designed to help blind and low-vision students read, listen to, and navigate study materials independently.

## Mission
Help students access and understand study material independently through a keyboard-first, screen-reader-friendly desktop application.

## Project structure

Phronon/
- apps/
  - desktop/    Electron + React desktop app
- backend/      Python backend scaffold
- docs/         Vision and roadmap
- scripts/      Local development helpers

## Accessibility principles
- Keyboard-first navigation
- Clear headings and labels
- Visible focus states
- Simple, predictable layout
- Minimal visual noise

## Requirements
- Node.js 20+
- npm 10+
- Python 3.11+

## Install
From the repository root:

```bash
npm install
python -m pip install -e ./backend
```

To enable OCR fallback for scanned or image-only PDFs, also install the optional backend OCR extras:

```bash
python -m pip install -e "./backend[ocr]"
```

Phronon's OCR fallback also needs a local Tesseract OCR installation available on your system path. The backend defaults to `eng+ara` OCR languages and you can override that locally with the `PHRONON_OCR_LANGUAGES` environment variable if needed.

## Run the desktop app
From the repository root:

```bash
npm run dev
```

This starts the React renderer with Vite and then opens the Electron window.

## Run the backend placeholder
After installing the backend package:

```bash
python -m phronon_backend
```

## Build the desktop app
From the repository root:

```bash
npm run build
```

## Current scope (v0.1)
- Project scaffold
- Basic Electron window
- React UI for Home, Reader, and Settings
- Reader support for opening and displaying local `.txt` files
- Reader playback controls backed by local browser/Electron speech synthesis
- Optional Reader voice commands for a small hands-free control set when local speech recognition is available
- Minimal backend package layout for later document processing

## Reader document loading
The Reader screen now includes an `Open .txt or .pdf file` action that opens the native file picker, reads the selected plain text file through Electron, and sends PDF files through the local Python backend for text extraction. The extracted text is displayed in the existing reader area so the current playback controls and keyboard shortcuts continue to work. If no file is loaded, the screen explains what to do next. If loading fails, the app shows a clear error message instead of failing silently.

PDF support stays intentionally simple in this first step:
- Text-based PDFs still use the original direct text extraction path.
- If direct PDF extraction returns little or no usable text, the backend now tries a local OCR fallback for scanned or image-only PDFs.
- OCR output then goes through a small local cleanup pass that normalizes whitespace, trims simple junk lines, and joins obvious wrapped lines without changing the direct text-PDF path.
- If OCR dependencies are missing or OCR still cannot recover enough readable text, Phronon shows a clear message instead of failing silently.

When Phronon is opening a PDF, the loading status now warns that scanned PDFs can take longer because local OCR may need to run.

## Reader text-to-speech playback
The Reader screen now supports local text-to-speech playback for the currently loaded `.txt` or extracted `.pdf` content using the built-in speech synthesis available in the Electron renderer. `Play` starts or resumes reading from the current paragraph, `Pause` pauses the current speech, `Stop` cancels it, and the reading speed slider adjusts the playback rate for upcoming speech. If no text is loaded, the app announces a clear status message instead of failing silently.

Phronon now checks the speech synthesis voices reported by the renderer and uses simple script detection to choose a voice. When the current text chunk contains Arabic script, Automatic mode prefers an Arabic-capable voice when one is available. For English or other non-Arabic text, Phronon keeps using the default voice. If the device does not report a suitable Arabic voice, playback still works with the default voice and the Reader shows a clear status message explaining that Arabic pronunciation may sound incorrect.

When a document is loaded, Phronon also splits the extracted text into readable paragraphs by looking for blank lines between text blocks. The Reader tracks a current paragraph, shows its position, highlights it in the document view, and can start speech from that paragraph onward.

## Reader keyboard shortcuts
Phronon supports a shared keyboard-first document open flow across the app. `Ctrl+O` opens the document picker from Home, Reader, or Settings. Reader-only controls stay scoped to the Reader screen: `Space` starts, pauses, or resumes reading from the current paragraph, `S` stops playback, `J` moves to the next paragraph, `K` moves to the previous paragraph, `R` repeats only the current paragraph, and `Alt+Up` or `Alt+Down` adjust the reading speed. These Reader shortcuts intentionally stay inactive while a form control such as the reading speed slider or a button has focus so normal keyboard behavior is preserved.

## Reader voice commands
Phronon now includes a minimal optional voice-command proof of concept for Reader control. The Reader shows a `Listen for command` button that starts one short listening session only when you press it. Phronon does not listen continuously, and the feature stays secondary to the existing keyboard and button controls.

The supported English phrases are intentionally narrow: `open file`, `play`, `pause`, `stop`, `next paragraph`, `previous paragraph`, `repeat paragraph`, `faster`, and `slower`. Matching is exact apart from simple casing, spacing, or punctuation cleanup, so the app stays predictable and easy to maintain.

If browser speech recognition is unavailable or microphone permission is denied, Phronon fails clearly with a status message and keeps all existing Reader controls working normally.

## Reader persistence
The desktop app now keeps a small local reader snapshot in the Electron renderer so study context survives restarts without any cloud service or new dependency. Phronon remembers the recent documents list, the current reading speed, the selected speech voice mode, the last opened document path, and the last active paragraph for that document. If opening a new document fails, Phronon keeps the current document and paragraph position in place and explains that the attempted file did not open.

On launch, Phronon restores the recent documents list and reading speed immediately. If the last opened file can still be read, the app reopens it and restores the saved paragraph position. If the file has moved, been deleted, or cannot be reopened, Phronon fails softly by leaving the app usable and showing the normal loading error instead of blocking the interface.

## Manual test steps
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
19. If local OCR dependencies are installed, open a scanned PDF or an image-only PDF and confirm Phronon extracts readable text through the same Reader view.
20. Open a document containing Arabic text and confirm Phronon prefers an Arabic-capable voice when the system reports one.
21. On a system without an Arabic speech voice, open Arabic text and confirm playback still starts while the Reader explains that Arabic playback may sound incorrect.
22. Open `Settings`, switch `Speech voice mode` between `Automatic` and `Always use default voice`, and confirm the choice persists after restarting the app.
23. If local OCR dependencies are not installed, open a scanned PDF or an image-only PDF and confirm Phronon shows a clear message explaining which local OCR tools are missing.
24. Move focus to the reading speed slider and press `Space`, `S`, `J`, `K`, `R`, `Alt+Up`, or `Alt+Down`; confirm the shortcut does not fire and the focused control keeps its normal behavior.
25. While playback is active, change the reading speed slider or press `Alt+Up` or `Alt+Down` and confirm the status says the new speed will apply on the next paragraph without restarting the current paragraph immediately.
26. Pause playback, change the reading speed, press `Play`, and confirm playback resumes from the current paragraph at the new speed.
27. With speech recognition support available, press `Listen for command`, say `play`, `pause`, `stop`, `next paragraph`, `previous paragraph`, `repeat paragraph`, `faster`, `slower`, and `open file`, and confirm each command maps to the same Reader behavior as the matching button or shortcut.
28. If speech recognition support is unavailable or microphone permission is denied, confirm the Reader shows a clear message and no existing controls break.
29. With no file loaded, press `Play`, `Space`, or `R` and confirm the app shows a clear status message.
30. Open a document, move to a later paragraph, change the reading speed, restart the app, and confirm the recent list and reading speed are restored.
31. If the same document still exists, confirm it reopens and the highlighted paragraph returns to the saved position.
32. Rename or remove the last opened file, restart the app, and confirm Phronon stays usable while showing a clear load failure.

## Next steps
- Add local text extraction pipeline
- Expand persistence coverage only when it improves accessibility and remains easy to maintain
