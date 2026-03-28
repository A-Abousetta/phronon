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
- Placeholder areas for import, document text, and playback controls
- Minimal backend package layout for later document processing

## Next steps
- Add file import wiring
- Add local text extraction pipeline
- Add text-to-speech playback
- Add persistence for reading state
