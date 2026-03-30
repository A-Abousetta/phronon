export type RuntimeSupportStatus = {
  isPackaged: boolean;
  coreAppReady: boolean;
  pdfSupportAvailable: boolean;
  ocrSupportAvailable: boolean;
  arabicOcrSupportAvailable: boolean;
  message: string;
};

export type DiagnosticsItem = {
  id: "core" | "pdf" | "ocr" | "arabicOcr" | "arabicTts";
  label: string;
  ready: boolean;
  statusLabel: "Works immediately" | "Optional extra setup" | "Unavailable on this device" | "Checking";
  detail: string;
};

export function buildRuntimeDiagnosticsItems(options: {
  runtimeSupportStatus: RuntimeSupportStatus | null;
  voicesInitialized: boolean;
  hasArabicTtsVoice: boolean;
}): DiagnosticsItem[] {
  const runtimeSupportStatus = options.runtimeSupportStatus;
  const arabicTtsReady = options.voicesInitialized && options.hasArabicTtsVoice;

  return [
    {
      id: "core",
      label: "Core app",
      ready: runtimeSupportStatus?.coreAppReady ?? false,
      statusLabel: runtimeSupportStatus?.coreAppReady ? "Works immediately" : "Checking",
      detail: runtimeSupportStatus?.coreAppReady
        ? "Open local study files, move through the app, and keep your place after restart."
        : "Phronon is checking whether the app is ready."
    },
    {
      id: "pdf",
      label: "Standard PDF support",
      ready: runtimeSupportStatus?.pdfSupportAvailable ?? false,
      statusLabel: runtimeSupportStatus?.pdfSupportAvailable ? "Works immediately" : "Checking",
      detail: runtimeSupportStatus?.pdfSupportAvailable
        ? "Text-based PDFs work in this release with no extra setup."
        : "Phronon is checking standard PDF support."
    },
    {
      id: "ocr",
      label: "OCR for scanned PDFs",
      ready: runtimeSupportStatus?.ocrSupportAvailable ?? false,
      statusLabel: runtimeSupportStatus?.ocrSupportAvailable ? "Works immediately" : "Optional extra setup",
      detail: runtimeSupportStatus?.ocrSupportAvailable
        ? "Scanned and image-only PDFs can use the local OCR path on this device."
        : "Scanned PDFs need optional setup: Python 3.11 or newer, pytesseract, pypdfium2, Pillow, and Tesseract OCR."
    },
    {
      id: "arabicOcr",
      label: "Arabic OCR",
      ready: runtimeSupportStatus?.arabicOcrSupportAvailable ?? false,
      statusLabel: runtimeSupportStatus?.arabicOcrSupportAvailable ? "Works immediately" : "Optional extra setup",
      detail: runtimeSupportStatus?.arabicOcrSupportAvailable
        ? "Arabic language data for Tesseract was found."
        : "Arabic OCR needs the Arabic language data for Tesseract."
    },
    {
      id: "arabicTts",
      label: "Arabic text-to-speech",
      ready: arabicTtsReady,
      statusLabel: !options.voicesInitialized
        ? "Checking"
        : arabicTtsReady
          ? "Works immediately"
          : "Unavailable on this device",
      detail: !options.voicesInitialized
        ? "Phronon is checking the speech voices available on this device."
        : arabicTtsReady
          ? "An Arabic-capable speech voice is available for playback."
          : "No Arabic-capable Windows speech voice was reported. Arabic text can still play, but pronunciation may sound wrong until one is installed or enabled."
    }
  ];
}
