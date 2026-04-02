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

## Build Windows releases

Phronon now supports two Windows release outputs without changing the app itself:

- an unpacked portable app folder
- a standard Windows installer

From the repository root:

```bash
npm run release:win
```

This creates the unpacked Windows app folder in `release/win-unpacked/`.

To build the Windows installer:

```bash
npm run release:win:installer
```

This creates an installer executable in `release-installer/`.

To build both outputs in one step:

```bash
npm run release:win:all
```

For full release notes and testing steps, see [docs/windows-release.md](./docs/windows-release.md).

## Current scope (v0.1)

- Project scaffold
- Basic Electron window
- React UI for Home, Reader, and Settings
- Reader support for opening and displaying local `.txt` files
- Reader playback controls backed by local browser/Electron speech synthesis
- Experimental Reader voice-command provider layer with a strict command grammar and honest runtime downgrade states
- Minimal backend package layout for later document processing

## Reader document loading

The Reader screen now includes an `Open .txt or .pdf file` action that opens the native file picker, reads the selected plain text file through Electron, and sends PDF files through the local Python backend for text extraction. The extracted text is displayed in the existing reader area so the current playback controls and keyboard shortcuts continue to work. If no file is loaded, the screen explains what to do next. If loading fails, the app shows a clear error message instead of failing silently.

PDF support stays intentionally simple in this first step:

- Text-based PDFs are now extracted directly inside the desktop app, so normal PDF reading no longer depends on Python or pip packages.
- If direct PDF extraction returns little or no usable text, Phronon then tries the optional local OCR fallback for scanned or image-only PDFs.
- OCR output then goes through a small local cleanup pass that normalizes whitespace, trims simple junk lines, and joins obvious wrapped lines without changing the direct text-PDF path.
- If OCR dependencies are missing or OCR still cannot recover enough readable text, Phronon shows a clear message instead of failing silently.

When Phronon is opening a PDF, the loading status now warns that scanned PDFs can take longer because local OCR may need to run.

In the packaged Windows release:

- TXT reading works immediately.
- Standard text-based PDF reading works immediately and is bundled into the app.
- OCR for scanned PDFs also needs `pytesseract`, `pypdfium2`, `Pillow`, and a local Tesseract OCR installation on the system path.
- Arabic OCR works best when the local Tesseract installation also includes Arabic language data, because Phronon defaults to `eng+ara` OCR languages.
- Arabic text-to-speech depends on the Windows device reporting at least one Arabic-capable voice. If it does not, playback still works, but Arabic pronunciation may sound incorrect.
- On first launch, the welcome panel announces what this device is ready for, and Settings now includes a diagnostics section for core app readiness, standard PDF support, OCR, Arabic OCR, and Arabic TTS.

## Reader text-to-speech playback

The Reader screen now supports local text-to-speech playback for the currently loaded `.txt` or extracted `.pdf` content using the built-in speech synthesis available in the Electron renderer. `Play` starts or resumes reading from the current paragraph, `Pause` pauses the current speech, `Stop` cancels it, and the reading speed slider adjusts the playback rate for upcoming speech. If no text is loaded, the app announces a clear status message instead of failing silently.

Phronon now checks the speech synthesis voices reported by the renderer and uses simple script detection to choose a voice. When the current text chunk contains Arabic script, Automatic mode prefers an Arabic-capable voice when one is available. For English or other non-Arabic text, Phronon keeps using the default voice. If the device does not report a suitable Arabic voice, playback still works with the default voice and the Reader shows a clear status message explaining that Arabic pronunciation may sound incorrect.

When a document is loaded, Phronon also splits the extracted text into readable paragraphs by looking for blank lines between text blocks. The Reader tracks a current paragraph, shows its position, highlights it in the document view, and can start speech from that paragraph onward.

## Reader search

The Reader now includes a compact in-document search for the currently loaded text. Enter a word or phrase, press `Search`, and Phronon looks through the current document text with simple case-insensitive matching. The search status reports the total number of matches and the current match position, and `Previous match` or `Next match` moves the current paragraph to the matching location without changing TXT, PDF, OCR, bookmark, or playback flows.

## Reader highlights

The Reader now supports a small first version of inline text highlights. Select a word or short phrase inside one paragraph, add an optional short note, and press `Save highlight`. Phronon stores that highlight locally for the current document and renders it back inline when you reopen the same file.

Highlights stay intentionally lightweight in this version. They are anchored to the current document, paragraph, selected text, and text offsets so they remain predictable without turning Reader into a full editor.

## Reader keyboard shortcuts

Phronon now uses one small keyboard command map instead of scattered shortcuts. `Ctrl+O` remains the single global shortcut for opening a document anywhere in the app. Inside Reader, plain keys handle live reading work: `Space` plays or pauses, `S` stops, `J` and `K` move paragraph by paragraph, `R` repeats the current paragraph, and `M` saves or updates the current paragraph marker. Search uses a familiar pattern with `Ctrl+F` or `/` to focus the Reader search field, `F3` for the next match, and `Shift+F3` for the previous match. `Ctrl+Shift+B` focuses the bookmarks tool, and `Ctrl+Shift+H` focuses the highlights tool. Saved study markers can be reached with `B` and `Shift+B` for bookmarks and `H` and `Shift+H` for highlights. `Alt+Up` and `Alt+Down` still change playback speed, and `Escape` returns focus to the Reader text region.

A compact shortcut reference now appears in both Reader and Settings so the command model is discoverable inside the app. Reader shortcuts intentionally stay inactive while focus is inside search, bookmark note fields, highlight note fields, sliders, or other form controls so typing remains safe, with one exception: `Escape` still returns focus to the Reader text region.

## Reader voice commands

Phronon now treats Reader voice commands as an experimental command-and-control path, not as dictation. The Reader still uses keyboard shortcuts, buttons, and screen readers as the primary reliable controls. The current implementation is a provider layer around the speech-recognition runtime exposed by Electron/Chromium, and Phronon labels that provider honestly instead of presenting it as a bundled local recognizer.

Each press starts one short listening attempt for one exact English command. Matching is intentionally narrow and based on a small grammar instead of free-form language. The current canonical commands are `open file`, `play`, `pause`, `stop`, `next paragraph`, `previous paragraph`, `repeat paragraph`, `faster`, `slower`, `jump to document`, `jump to playback`, `jump to search`, `jump to highlights`, `jump to bookmarks`, and `jump to shortcuts`. A few small synonyms are also accepted for the same commands, such as `open document`, `speed up`, `slow down`, and `jump to help`.

The Reader now classifies voice-command outcomes explicitly: unsupported, available to try, listening, heard command, heard nothing, no supported command matched, permission denied, runtime ended early, and unreliable on this device/runtime. If the Electron/Chromium speech service ends early, Phronon marks the provider unreliable and disables the button instead of pretending the feature is still working.

## Reader persistence

The desktop app now keeps a small local reader snapshot in the Electron renderer so study context survives restarts without any cloud service or new dependency. Phronon remembers the recent documents list, the current reading speed, low-vision display preferences, the selected speech voice mode, the last opened document path, and the last active paragraph for that document. If opening a new document fails, Phronon keeps the current document and paragraph position in place and explains that the attempted file did not open.

On launch, Phronon restores the recent documents list and reading speed immediately. If the last opened file can still be read, the app reopens it and restores the saved paragraph position. If the file has moved, been deleted, or cannot be reopened, Phronon fails softly by leaving the app usable and showing the normal loading error instead of blocking the interface.

Bookmarks now stay lightweight study markers. Each saved paragraph can include one short optional note, and that note is stored in the same local Reader persistence snapshot so it survives restarts without changing the wider Reader workflow.

Reader highlights use the same local-first persistence snapshot. Saved highlights and their short notes stay scoped to the current document and reappear when that document is reopened.

## Low-vision display controls

Phronon now includes a small set of low-vision-friendly display controls in `Settings` without changing the main workflow. Users can increase general app text size, increase Reader text size separately, and switch to a stronger contrast mode that makes surfaces, borders, status cards, and the reading area easier to distinguish while keeping the same calm layout.

These preferences are local-first and persist across restarts. Keyboard shortcuts, focus order, playback behavior, TXT/PDF/OCR loading, and screen-reader labels continue to behave the same way.

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

## Next steps

- Add local text extraction pipeline
- Expand persistence coverage only when it improves accessibility and remains easy to maintain
