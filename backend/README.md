# Backend

The backend folder holds the local Python services that will handle document import and text extraction.

Current document extraction support:
- The packaged desktop app now handles standard text-based PDFs directly.
- This backend is mainly needed for optional OCR on scanned or image-only PDFs.

Optional OCR dependencies:
- Python packages: `pytesseract`, `pypdfium2`, and `Pillow`
- System dependency: Tesseract OCR available on your machine path

Install the optional Python OCR packages with:

```bash
python -m pip install -e "./backend[ocr]"
```

The backend defaults to `eng+ara` OCR languages. Override that with `PHRONON_OCR_LANGUAGES` if your local Tesseract setup uses a different language combination.
