import argparse
import json
import sys
from pathlib import Path

from pypdf import PdfReader


def extract_pdf_text(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    extracted_pages = []

    for page in reader.pages:
        extracted_pages.append(page.extract_text() or "")

    return "\n\n".join(page.strip() for page in extracted_pages if page.strip()).strip()


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
                    "error": "Phronon could not read that PDF. Please choose a text-based PDF and try again."
                }
            )
        )
        return 1

    if not text.strip():
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "no_text",
                    "error": "This PDF does not contain enough extractable text. Scanned PDF and OCR support are not implemented yet."
                }
            )
        )
        return 0

    print(json.dumps({"ok": True, "reason": "success", "text": text}))
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
