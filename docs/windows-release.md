# Windows Release Guide

Phronon now supports two Windows release outputs from the same Electron Builder setup:
- `win-unpacked` for a portable app folder
- `nsis` for a standard Windows installer

The app itself stays the same in both formats.

## Why this setup
- It keeps the current working unpacked release path.
- It adds the simplest common Windows installer path.
- It keeps the release process short enough for a beginner maintainer.
- It preserves the packaged icon and branding in both outputs.

## Prerequisites for maintainers
- Node.js 20+
- npm 10+
- Python 3.11+ if you want to verify PDF support locally

Install project dependencies from the repository root:

```bash
npm install
python -m pip install -e ./backend
```

Optional OCR test dependencies:

```bash
python -m pip install pytesseract pypdfium2 Pillow
```

For OCR testing, also install Tesseract OCR and make sure `tesseract.exe` is on the system path.

## Build outputs

Build the unpacked release:

```bash
npm run release:win
```

Output:
- `release/win-unpacked/Phronon.exe`

Build the installer:

```bash
npm run release:win:installer
```

Output:
- `release-installer/Phronon Setup 0.1.0.exe`

Build both:

```bash
npm run release:win:all
```

## Installer behavior
The installer uses a standard assisted NSIS flow:
- not one-click
- keyboard-friendly wizard steps
- desktop shortcut created
- Start menu shortcut created
- fixed default install directory for a more predictable first release

This keeps first-time setup more understandable for screen-reader and keyboard users than a silent or overly customized flow.

## How to test the unpacked release
1. Run `npm run release:win`.
2. Launch `release/win-unpacked/Phronon.exe`.
3. Confirm the app icon appears correctly.
4. Confirm the full UI appears.
5. Confirm the welcome panel announces local support status.
6. Open a `.txt` file and confirm reading works.
7. If `pypdf` is installed, open a text PDF and confirm it loads.
8. If OCR dependencies are installed, open a scanned PDF and confirm OCR fallback works.

## How to test the installer
1. Run `npm run release:win:installer`.
2. Launch `release-installer/Phronon Setup 0.1.0.exe`.
3. Confirm the installer can be completed with keyboard navigation alone.
4. Confirm Phronon launches after installation.
5. Confirm the installed app icon and app name are correct.
6. Repeat the same TXT, PDF, and OCR checks from the unpacked test pass.
7. Confirm relaunch still restores recent documents and reading position.

## First-time setup for end users

### Works immediately
- Opening and reading `.txt` files
- Opening and reading standard text-based `.pdf` files
- Reader playback, keyboard shortcuts, persistence, and settings
- English text-to-speech using available system voices

### Needed for OCR on scanned or image-only PDFs
1. Install Python 3.11 or newer.
2. Run `python -m pip install pytesseract pypdfium2 Pillow`.
3. Install Tesseract OCR.
4. Make sure `tesseract.exe` is on the system path.

### Needed for Arabic OCR
1. Install Tesseract OCR with Arabic language data.
2. Keep the default `eng+ara` OCR languages, or set `PHRONON_OCR_LANGUAGES` if your local Tesseract setup uses different language packs.

### Needed for Arabic text-to-speech
1. Install or enable at least one Arabic-capable Windows speech voice.
2. If no Arabic voice is available, Phronon still plays text using the default voice and explains that pronunciation may be inaccurate.

## Accessibility notes for first launch
- The installer path is intentionally standard and keyboard-friendly.
- The app welcome panel reports local TXT, PDF, and OCR readiness.
- Settings includes a diagnostics section that reports core app readiness, standard PDF support, OCR readiness, Arabic OCR readiness, and Arabic TTS readiness.
- If Arabic voice support is missing, the app reports that clearly instead of failing silently.
- If OCR dependencies are missing, scanned PDFs fail with explicit setup guidance.

## Notes for beginner maintainers
- Packaging config lives in `apps/desktop/package.json`.
- `npm run release:win` keeps the current unpacked path.
- `npm run release:win:installer` produces the installer in a separate output folder so it does not interfere with the unpacked build.
- `npm run release:win:all` produces both outputs in one pass.
- Keep this setup simple unless real release needs force more Windows-specific complexity later.
