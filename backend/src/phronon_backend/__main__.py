import argparse
import importlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

MIN_EXTRACTED_WORDS = 8
MIN_EXTRACTED_CHARACTERS = 40
DEFAULT_OCR_LANGUAGES = "eng+ara"
OCR_RENDER_SCALE = 2
OCR_BLOCK_BREAK = re.compile(r"\n\s*\n+", flags=re.UNICODE)
OCR_ZERO_WIDTH_CHARACTERS = re.compile(r"[\u200b-\u200f\u2060\ufeff]", flags=re.UNICODE)
OCR_EXTRA_SPACES = re.compile(r"[ \t]+", flags=re.UNICODE)
OCR_SPACE_BEFORE_PUNCTUATION = re.compile(r"\s+([,.;:!?%)\]\}،؛؟])", flags=re.UNICODE)
OCR_SPACE_AFTER_OPENING_PUNCTUATION = re.compile(r"([(\[\{«])\s+", flags=re.UNICODE)
OCR_TERMINAL_PUNCTUATION = re.compile(r"[.!?؟…;؛:)]$", flags=re.UNICODE)
OCR_SOFT_WRAP_PUNCTUATION = re.compile(r"[,،\-–—/]$", flags=re.UNICODE)
OCR_STRUCTURAL_LINE = re.compile(r"^[-*•]\s+|^\d+[\.\)]\s+|[:؛]$", flags=re.UNICODE)


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


def normalize_ocr_line(line: str) -> str:
    normalized_line = unicodedata.normalize("NFKC", line)
    normalized_line = normalized_line.replace("\u00ad", "")
    normalized_line = OCR_ZERO_WIDTH_CHARACTERS.sub("", normalized_line)
    normalized_line = OCR_EXTRA_SPACES.sub(" ", normalized_line)
    normalized_line = OCR_SPACE_BEFORE_PUNCTUATION.sub(r"\1", normalized_line)
    normalized_line = OCR_SPACE_AFTER_OPENING_PUNCTUATION.sub(r"\1", normalized_line)
    return normalized_line.strip()


def line_letter_count(line: str) -> int:
    return sum(1 for character in line if character.isalpha())


def line_digit_count(line: str) -> int:
    return sum(1 for character in line if character.isdigit())


def line_symbol_count(line: str) -> int:
    compact_line = re.sub(r"\s+", "", line, flags=re.UNICODE)
    return sum(
        1
        for character in compact_line
        if not character.isalpha() and not character.isdigit()
    )


def looks_like_structural_ocr_line(line: str) -> bool:
    return bool(OCR_STRUCTURAL_LINE.search(line))


def looks_like_junk_ocr_line(line: str) -> bool:
    if not line:
        return True

    compact_line = re.sub(r"\s+", "", line, flags=re.UNICODE)

    if not compact_line:
        return True

    letter_count = line_letter_count(compact_line)
    digit_count = line_digit_count(compact_line)
    symbol_count = line_symbol_count(compact_line)

    if letter_count == 0 and digit_count == 0:
        return True

    if len(compact_line) <= 3 and letter_count == 0 and symbol_count > 0:
        return True

    if len(compact_line) >= 4 and letter_count <= 1 and digit_count <= 1 and symbol_count / len(compact_line) >= 0.6:
        return True

    return False


def should_merge_ocr_lines(current_line: str, next_line: str) -> bool:
    if not current_line or not next_line:
        return False

    if looks_like_structural_ocr_line(current_line) or looks_like_structural_ocr_line(next_line):
        return False

    if OCR_TERMINAL_PUNCTUATION.search(current_line):
        return False

    if OCR_SOFT_WRAP_PUNCTUATION.search(current_line):
        return True

    return len(current_line) <= 80 or len(next_line) <= 80


def build_ocr_paragraphs_from_block(block: str) -> list[str]:
    cleaned_lines = [
        normalize_ocr_line(line)
        for line in block.splitlines()
    ]
    cleaned_lines = [line for line in cleaned_lines if line and not looks_like_junk_ocr_line(line)]

    if not cleaned_lines:
        return []

    paragraphs: list[str] = []
    current_paragraph = cleaned_lines[0]

    for next_line in cleaned_lines[1:]:
        if should_merge_ocr_lines(current_paragraph, next_line):
            current_paragraph = f"{current_paragraph} {next_line}".strip()
            continue

        paragraphs.append(current_paragraph)
        current_paragraph = next_line

    paragraphs.append(current_paragraph)
    return paragraphs


def cleanup_ocr_text(raw_text: str) -> str:
    normalized_text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    paragraph_blocks = OCR_BLOCK_BREAK.split(normalized_text)
    cleaned_paragraphs: list[str] = []

    for block in paragraph_blocks:
        cleaned_paragraphs.extend(build_ocr_paragraphs_from_block(block))

    return "\n\n".join(paragraph for paragraph in cleaned_paragraphs if paragraph).strip()


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
                cleaned_page_text = cleanup_ocr_text(page_text)
                if cleaned_page_text:
                    extracted_pages.append(cleaned_page_text)
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
                    "error": "Phronon tried local OCR for this PDF, but could not extract enough readable text. The scan may be blurry, rotated, or missing the right OCR language data."
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
