import argparse
import importlib
import json
import os
import re
import sys
from pathlib import Path

MIN_EXTRACTED_WORDS = 8
MIN_EXTRACTED_CHARACTERS = 40
DEFAULT_OCR_LANGUAGES = "eng+ara"
OCR_RENDER_SCALE = 2


class OcrDependencyError(RuntimeError):
    """Raised when local OCR tooling is not installed."""


class OcrExtractionError(RuntimeError):
    """Raised when OCR setup exists but the extraction process fails."""


def extract_pdf_text(file_path: Path) -> str:
    pdf_reader_module = importlib.import_module("pypdf")
    pdf_reader = pdf_reader_module.PdfReader
    reader = pdf_reader(str(file_path))
    extracted_pages = []

    for page in reader.pages:
        extracted_pages.append(page.extract_text() or "")

    return "\n\n".join(page.strip() for page in extracted_pages if page.strip()).strip()


def has_usable_text(text: str) -> bool:
    words = re.findall(r"\w+", text, flags=re.UNICODE)
    compact_characters = re.sub(r"\s+", "", text, flags=re.UNICODE)
    return len(words) >= MIN_EXTRACTED_WORDS and len(compact_characters) >= MIN_EXTRACTED_CHARACTERS


def get_ocr_languages() -> str:
    return os.environ.get("PHRONON_OCR_LANGUAGES", DEFAULT_OCR_LANGUAGES)


def load_ocr_dependencies():
    try:
        pytesseract = importlib.import_module("pytesseract")
    except ImportError as exc:
        raise OcrDependencyError(
            "This PDF looks scanned or image-only. To enable local OCR, install Tesseract OCR on your system and install the optional backend OCR dependencies: pytesseract, pypdfium2, and Pillow."
        ) from exc

    try:
        pdfium = importlib.import_module("pypdfium2")
    except ImportError as exc:
        raise OcrDependencyError(
            "This PDF looks scanned or image-only. To enable local OCR, install Tesseract OCR on your system and install the optional backend OCR dependencies: pytesseract, pypdfium2, and Pillow."
        ) from exc

    try:
        importlib.import_module("PIL.Image")
    except ImportError as exc:
        raise OcrDependencyError(
            "This PDF looks scanned or image-only. To enable local OCR, install Tesseract OCR on your system and install the optional backend OCR dependencies: pytesseract, pypdfium2, and Pillow."
        ) from exc

    return pytesseract, pdfium


def extract_pdf_text_with_ocr(file_path: Path) -> str:
    pytesseract, pdfium = load_ocr_dependencies()
    ocr_languages = get_ocr_languages()

    try:
        pytesseract.get_tesseract_version()
    except Exception as exc:
        raise OcrDependencyError(
            "This PDF looks scanned or image-only. Phronon could not find a local Tesseract OCR installation. Install Tesseract OCR and try again."
        ) from exc

    document = None
    extracted_pages = []

    try:
        document = pdfium.PdfDocument(str(file_path))

        for page_index in range(len(document)):
            page = document[page_index]
            bitmap = None
            pil_image = None

            try:
                bitmap = page.render(scale=OCR_RENDER_SCALE)
                pil_image = bitmap.to_pil()
                page_text = pytesseract.image_to_string(pil_image, lang=ocr_languages) or ""
                if page_text.strip():
                    extracted_pages.append(page_text.strip())
            except OcrDependencyError:
                raise
            except Exception as exc:
                raise OcrExtractionError(
                    "Phronon tried local OCR for this PDF, but OCR could not run successfully."
                ) from exc
            finally:
                if pil_image is not None and hasattr(pil_image, "close"):
                    pil_image.close()
                if bitmap is not None and hasattr(bitmap, "close"):
                    bitmap.close()
                if hasattr(page, "close"):
                    page.close()
    except OcrDependencyError:
        raise
    except OcrExtractionError:
        raise
    except Exception as exc:
        raise OcrExtractionError(
            "Phronon tried local OCR for this PDF, but OCR could not prepare the document pages."
        ) from exc
    finally:
        if document is not None and hasattr(document, "close"):
            document.close()

    return "\n\n".join(extracted_pages).strip()


def handle_extract_text(file_path: Path) -> int:
    if not file_path.exists() or not file_path.is_file():
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "file_not_found",
                    "error": "Phronon could not find that file."
                }
            )
        )
        return 1

    if file_path.suffix.lower() != ".pdf":
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "unsupported_file",
                    "error": "Only PDF extraction is supported by this backend command."
                }
            )
        )
        return 1

    try:
        text = extract_pdf_text(file_path)
    except Exception:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "read_error",
                    "error": "Phronon could not read that PDF. Please choose a readable PDF and try again."
                }
            )
        )
        return 1

    if has_usable_text(text):
        print(json.dumps({"ok": True, "reason": "success", "text": text}))
        return 0

    try:
        ocr_text = extract_pdf_text_with_ocr(file_path)
    except OcrDependencyError as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "ocr_dependencies_missing",
                    "error": str(error)
                }
            )
        )
        return 0
    except OcrExtractionError as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "ocr_failed",
                    "error": str(error)
                }
            )
        )
        return 0

    if not has_usable_text(ocr_text):
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "ocr_no_text",
                    "error": "Phronon tried local OCR for this PDF, but could not extract enough readable text."
                }
            )
        )
        return 0

    print(json.dumps({"ok": True, "reason": "success", "text": ocr_text}))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="phronon_backend")
    subparsers = parser.add_subparsers(dest="command")

    extract_text_parser = subparsers.add_parser(
        "extract-text",
        help="Extract text from a local PDF file."
    )
    extract_text_parser.add_argument("--file", required=True, type=Path)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "extract-text":
        sys.exit(handle_extract_text(args.file))

    project_root = Path(__file__).resolve().parents[3]
    print("Phronon backend scaffold is ready.")
    print(f"Project root: {project_root}")
    print("Next step: add document import and text extraction services.")


if __name__ == "__main__":
    main()
