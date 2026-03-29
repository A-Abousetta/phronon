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
      detail: runtimeSupportStatus?.coreAppReady
        ? "Ready. The packaged desktop app can open, navigate, and persist local study state."
        : "Checking whether the packaged app is ready."
    },
    {
      id: "pdf",
      label: "Standard PDF support",
      ready: runtimeSupportStatus?.pdfSupportAvailable ?? false,
      detail: runtimeSupportStatus?.pdfSupportAvailable
        ? "Ready. Standard text-based PDF reading is built into this release."
        : "Missing. Standard PDF support is still being checked."
    },
    {
      id: "ocr",
      label: "OCR for scanned PDFs",
      ready: runtimeSupportStatus?.ocrSupportAvailable ?? false,
      detail: runtimeSupportStatus?.ocrSupportAvailable
        ? "Ready. Scanned and image-only PDFs can use the optional local OCR path."
        : "Missing. Install Python 3.11 or newer, pytesseract, pypdfium2, Pillow, and Tesseract OCR to enable OCR."
    },
    {
      id: "arabicOcr",
      label: "Arabic OCR",
      ready: runtimeSupportStatus?.arabicOcrSupportAvailable ?? false,
      detail: runtimeSupportStatus?.arabicOcrSupportAvailable
        ? "Ready. Tesseract Arabic language data appears to be available."
        : "Missing. Install Arabic language data for Tesseract to improve Arabic OCR."
    },
    {
      id: "arabicTts",
      label: "Arabic text-to-speech",
      ready: arabicTtsReady,
      detail: !options.voicesInitialized
        ? "Checking available speech voices on this device."
        : arabicTtsReady
          ? "Ready. An Arabic-capable speech voice was reported by this device."
          : "Missing. Install or enable an Arabic-capable Windows speech voice for better Arabic playback."
    }
  ];
}
