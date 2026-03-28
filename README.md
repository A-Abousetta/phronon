# Phronon

Phronon is an accessibility-first open-source study assistant for blind and low-vision students.

This repository now includes the initial scaffold for:
- An Electron desktop app
- A React interface with Home, Reader, and Settings screens
- A local Python backend placeholder
- Project docs for vision and roadmap

## Mission
Help students import study material, extract readable text, and listen to it independently through a keyboard-first and screen-reader-friendly desktop app.

## Current structure
```text
Phronon/
  apps/
    desktop/   Electron + React desktop app
  backend/     Python backend scaffold
  docs/        Vision and roadmap
  scripts/     Small helper scripts for local development
```

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
pip install -e ./backend
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

## Version 0.1 scope
- Project scaffold
- Basic Electron window
- React UI for Home, Reader, and Settings
- Reader support for opening and displaying local `.txt` files
- Reader playback controls backed by local browser/Electron speech synthesis
- Minimal backend package layout for later document processing

## Reader text loading
The Reader screen now includes an `Open .txt file` action that opens the native file picker, reads the selected plain text file through Electron, and displays the full text in the reader area. If no file is loaded, the screen explains what to do next. If file reading fails, the app shows a clear error message.

## Reader text-to-speech playback
The Reader screen now supports local text-to-speech playback for the currently loaded `.txt` content using the built-in speech synthesis available in the Electron renderer. `Play` starts or resumes reading, `Pause` pauses the current speech, `Stop` cancels it, and the reading speed slider adjusts the playback rate for new speech. If no text is loaded, the app announces a clear status message instead of failing silently.

## Reader keyboard shortcuts
The Reader screen also supports keyboard-first controls for core actions. `Ctrl+O` opens the existing `.txt` picker, `Space` toggles play and pause while the Reader is active, and `S` stops playback. These shortcuts intentionally stay inactive while a form control such as the reading speed slider or a button has focus so normal keyboard behavior is preserved.

## Manual test steps
1. Run `npm run dev` from the repository root.
2. Open the `Reader` screen in the desktop app.
3. Select `Open .txt file` and choose a plain text file.
4. Press `Play` and confirm the text is spoken aloud.
5. Press `Pause` and confirm speech pauses.
6. Press `Play` again and confirm playback resumes.
7. Press `Stop` and confirm speech is canceled.
8. Press `Space` while the Reader is active and confirm it toggles between play and pause.
9. Press `S` while speech is playing or paused and confirm playback stops without overlapping speech.
10. Press `Ctrl+O` while the Reader is active and confirm the native text-file picker opens.
11. Move focus to the reading speed slider and press `Space` or `S`; confirm the shortcut does not fire and the focused control keeps its normal behavior.
12. Change the reading speed slider, press `Stop`, then press `Play` again and confirm the new rate is used.
13. With no file loaded, press `Play` or `Space` and confirm the app shows a clear status message.

## Next steps
- Add local text extraction pipeline
- Add persistence for reading state
