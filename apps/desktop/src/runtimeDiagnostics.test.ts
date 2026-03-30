import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRuntimeDiagnosticsItems, type RuntimeSupportStatus } from "./runtimeDiagnostics.js";

const fullyReadyRuntimeStatus: RuntimeSupportStatus = {
  isPackaged: true,
  coreAppReady: true,
  pdfSupportAvailable: true,
  ocrSupportAvailable: true,
  arabicOcrSupportAvailable: true,
  message: "You can start right away with TXT files, standard PDFs, scanned PDFs, and Arabic OCR on this device."
};

test("buildRuntimeDiagnosticsItems reports all ready capabilities clearly", () => {
  const items = buildRuntimeDiagnosticsItems({
    runtimeSupportStatus: fullyReadyRuntimeStatus,
    voicesInitialized: true,
    hasArabicTtsVoice: true
  });

  assert.deepEqual(
    items.map((item) => ({ id: item.id, ready: item.ready, statusLabel: item.statusLabel })),
    [
      { id: "core", ready: true, statusLabel: "Works immediately" },
      { id: "pdf", ready: true, statusLabel: "Works immediately" },
      { id: "ocr", ready: true, statusLabel: "Works immediately" },
      { id: "arabicOcr", ready: true, statusLabel: "Works immediately" },
      { id: "arabicTts", ready: true, statusLabel: "Works immediately" }
    ]
  );
});

test("buildRuntimeDiagnosticsItems keeps missing OCR and Arabic voice guidance explicit", () => {
  const items = buildRuntimeDiagnosticsItems({
    runtimeSupportStatus: {
      ...fullyReadyRuntimeStatus,
      ocrSupportAvailable: false,
      arabicOcrSupportAvailable: false
    },
    voicesInitialized: true,
    hasArabicTtsVoice: false
  });

  assert.equal(items.find((item) => item.id === "ocr")?.ready, false);
  assert.equal(items.find((item) => item.id === "ocr")?.statusLabel, "Optional extra setup");
  assert.match(items.find((item) => item.id === "ocr")?.detail ?? "", /Scanned PDFs need optional setup/i);
  assert.equal(items.find((item) => item.id === "arabicTts")?.ready, false);
  assert.equal(items.find((item) => item.id === "arabicTts")?.statusLabel, "Unavailable on this device");
  assert.match(items.find((item) => item.id === "arabicTts")?.detail ?? "", /No Arabic-capable Windows speech voice/i);
});
