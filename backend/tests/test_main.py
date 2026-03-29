import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

BACKEND_SRC = Path(__file__).resolve().parents[1] / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from phronon_backend.__main__ import OcrDependencyError, handle_extract_text, has_usable_text


class PdfExtractionTests(unittest.TestCase):
    def test_has_usable_text_requires_enough_words_and_characters(self):
        self.assertFalse(has_usable_text("Too short"))
        self.assertTrue(
            has_usable_text("This extracted paragraph contains enough readable words to count as usable text.")
        )

    def test_handle_extract_text_keeps_direct_pdf_flow_when_text_is_usable(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf") as handle:
            with patch("phronon_backend.__main__.extract_pdf_text", return_value="This PDF already contains enough readable text for the reader to use safely."), patch(
                "phronon_backend.__main__.extract_pdf_text_with_ocr"
            ) as extract_pdf_text_with_ocr:
                stdout = io.StringIO()

                with redirect_stdout(stdout):
                    result_code = handle_extract_text(Path(handle.name))

        payload = json.loads(stdout.getvalue())

        self.assertEqual(result_code, 0)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["reason"], "success")
        self.assertIn("enough readable text", payload["text"])
        extract_pdf_text_with_ocr.assert_not_called()

    def test_handle_extract_text_uses_ocr_when_direct_text_is_not_usable(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf") as handle:
            with patch("phronon_backend.__main__.extract_pdf_text", return_value=""), patch(
                "phronon_backend.__main__.extract_pdf_text_with_ocr",
                return_value="OCR recovered enough readable words from the scanned document for playback to work."
            ):
                stdout = io.StringIO()

                with redirect_stdout(stdout):
                    result_code = handle_extract_text(Path(handle.name))

        payload = json.loads(stdout.getvalue())

        self.assertEqual(result_code, 0)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["reason"], "success")
        self.assertIn("OCR recovered enough readable words", payload["text"])

    def test_handle_extract_text_reports_missing_ocr_dependencies_clearly(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf") as handle:
            with patch("phronon_backend.__main__.extract_pdf_text", return_value=""), patch(
                "phronon_backend.__main__.extract_pdf_text_with_ocr",
                side_effect=OcrDependencyError("Install local OCR dependencies.")
            ):
                stdout = io.StringIO()

                with redirect_stdout(stdout):
                    result_code = handle_extract_text(Path(handle.name))

        payload = json.loads(stdout.getvalue())

        self.assertEqual(result_code, 0)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["reason"], "ocr_dependencies_missing")
        self.assertEqual(payload["error"], "Install local OCR dependencies.")

    def test_handle_extract_text_reports_when_ocr_finds_no_usable_text(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf") as handle:
            with patch("phronon_backend.__main__.extract_pdf_text", return_value=""), patch(
                "phronon_backend.__main__.extract_pdf_text_with_ocr",
                return_value="few words"
            ):
                stdout = io.StringIO()

                with redirect_stdout(stdout):
                    result_code = handle_extract_text(Path(handle.name))

        payload = json.loads(stdout.getvalue())

        self.assertEqual(result_code, 0)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["reason"], "ocr_no_text")


if __name__ == "__main__":
    unittest.main()
