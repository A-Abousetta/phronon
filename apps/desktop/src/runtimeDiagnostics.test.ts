import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRuntimeDiagnosticsItems, type RuntimeSupportStatus } from "./runtimeDiagnostics.js";

const fullyReadyRuntimeStatus: RuntimeSupportStatus = {
  isPackaged: true,
  coreAppReady: true,
  pdfSupportAvailable: true,
  ocrSupportAvailable: true,
  arabicOcrSupportAvailable: true,
  message: "Core app, standard PDF reading, OCR, and Arabic OCR are ready on this device."
};

test("buildRuntimeDiagnosticsItems reports all ready capabilities clearly", () => {
  const items = buildRuntimeDiagnosticsItems({
    runtimeSupportStatus: fullyReadyRuntimeStatus,
    voicesInitialized: true,
    hasArabicTtsVoice: true
  });

  assert.deepEqual(
    items.map((item) => ({ id: item.id, ready: item.ready })),
    [
      { id: "core", ready: true },
      { id: "pdf", ready: true },
      { id: "ocr", ready: true },
      { id: "arabicOcr", ready: true },
      { id: "arabicTts", ready: true }
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
  assert.match(items.find((item) => item.id === "ocr")?.detail ?? "", /Install Python 3.11 or newer/i);
  assert.equal(items.find((item) => item.id === "arabicTts")?.ready, false);
  assert.match(items.find((item) => item.id === "arabicTts")?.detail ?? "", /Arabic-capable Windows speech voice/i);
});
