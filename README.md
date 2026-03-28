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
- Minimal backend package layout for later document processing

## Reader document loading
The Reader screen now includes an `Open .txt or .pdf file` action that opens the native file picker, reads the selected plain text file through Electron, and sends PDF files through the local Python backend for text extraction. The extracted text is displayed in the existing reader area so the current playback controls and keyboard shortcuts continue to work. If no file is loaded, the screen explains what to do next. If loading fails, the app shows a clear error message instead of failing silently.

PDF support is intentionally limited for this first step:
- Only digital, text-based PDFs are supported.
- Scanned PDFs and OCR are not implemented yet.
- If a PDF has little or no extractable text, Phronon shows a clear message explaining that OCR support is not available yet.

## Reader text-to-speech playback
The Reader screen now supports local text-to-speech playback for the currently loaded `.txt` or extracted `.pdf` content using the built-in speech synthesis available in the Electron renderer. `Play` starts or resumes reading from the current paragraph, `Pause` pauses the current speech, `Stop` cancels it, and the reading speed slider adjusts the playback rate for upcoming speech. If no text is loaded, the app announces a clear status message instead of failing silently.

When a document is loaded, Phronon also splits the extracted text into readable paragraphs by looking for blank lines between text blocks. The Reader tracks a current paragraph, shows its position, highlights it in the document view, and can start speech from that paragraph onward.

## Reader keyboard shortcuts
The Reader screen also supports keyboard-first controls for core actions. `Ctrl+O` opens the document picker, `Space` starts, pauses, or resumes reading from the current paragraph, `S` stops playback, `J` moves to the next paragraph, `K` moves to the previous paragraph, `R` repeats only the current paragraph, and `Alt+Up` or `Alt+Down` adjust the reading speed. These shortcuts intentionally stay inactive while a form control such as the reading speed slider or a button has focus so normal keyboard behavior is preserved.

## Reader persistence
The desktop app now keeps a small local reader snapshot in the Electron renderer so study context survives restarts without any cloud service or new dependency. Phronon remembers the recent documents list, the current reading speed, the last opened document path, and the last active paragraph for that document.

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
13. Open a text-based `.pdf` file and confirm extracted text appears in the same reader area.
14. Press `Play` and confirm the extracted PDF text is read aloud.
15. Confirm the Reader status announces the current paragraph position, such as `Paragraph 1 of Y`.
16. Press `J` and confirm the current paragraph moves forward and the highlighted paragraph updates.
17. Press `K` and confirm the current paragraph moves backward and the highlighted paragraph updates.
18. Press `R` and confirm only the highlighted paragraph is read from its beginning.
19. Open a scanned PDF or an image-only PDF and confirm Phronon shows a clear message that OCR/scanned PDF support is not implemented yet.
20. Move focus to the reading speed slider and press `Space`, `S`, `J`, `K`, `R`, `Alt+Up`, or `Alt+Down`; confirm the shortcut does not fire and the focused control keeps its normal behavior.
21. While playback is active, change the reading speed slider or press `Alt+Up` or `Alt+Down` and confirm the status says the new speed will apply on the next paragraph without restarting the current paragraph immediately.
22. Pause playback, change the reading speed, press `Play`, and confirm playback resumes from the current paragraph at the new speed.
23. With no file loaded, press `Play`, `Space`, or `R` and confirm the app shows a clear status message.
24. Open a document, move to a later paragraph, change the reading speed, restart the app, and confirm the recent list and reading speed are restored.
25. If the same document still exists, confirm it reopens and the highlighted paragraph returns to the saved position.
26. Rename or remove the last opened file, restart the app, and confirm Phronon stays usable while showing a clear load failure.

## Next steps
- Add local text extraction pipeline
- Expand persistence coverage only when it improves accessibility and remains easy to maintain
