# Backend

The backend folder holds the local Python services that will handle document import and text extraction.

Current document extraction support:
- Text-based PDFs are read with `pypdf`.
- Scanned or image-only PDFs can fall back to local OCR when direct extraction does not return enough usable text.

Optional OCR dependencies:
- Python packages: `pytesseract`, `pypdfium2`, and `Pillow`
- System dependency: Tesseract OCR available on your machine path

Install the optional Python OCR packages with:

```bash
python -m pip install -e "./backend[ocr]"
```

The backend defaults to `eng+ara` OCR languages. Override that with `PHRONON_OCR_LANGUAGES` if your local Tesseract setup uses a different language combination.
