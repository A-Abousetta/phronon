import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { execFile } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "../../..");
const desktopPublicPath = path.join(projectRoot, "apps", "desktop", "public");

type PythonRuntime = {
  command: string;
  args: string[];
};

type PdfExtractionFailureReason =
  | "backend_invocation_failed"
  | "backend_error"
  | "file_not_found"
  | "no_text"
  | "ocr_dependencies_missing"
  | "ocr_failed"
  | "ocr_no_text"
  | "read_error"
  | "unsupported_file";

type PdfExtractionResult =
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      reason: PdfExtractionFailureReason;
      error: string;
    };

type BackendJsonResponse = {
  ok?: boolean;
  reason?: string;
  text?: string;
  error?: string;
};

type RuntimeSupportStatus = {
  isPackaged: boolean;
  coreAppReady: boolean;
  pdfSupportAvailable: boolean;
  ocrSupportAvailable: boolean;
  arabicOcrSupportAvailable: boolean;
  message: string;
};

type OcrProbeStatus = {
  pythonAvailable: boolean;
  ocrPackagesAvailable: boolean;
  tesseractAvailable: boolean;
  arabicLanguageAvailable: boolean;
};

const MIN_EXTRACTED_WORDS = 8;
const MIN_EXTRACTED_CHARACTERS = 40;

function isDevMode() {
  return !app.isPackaged || Boolean(process.env.PHRONON_RENDERER_URL);
}

function getBackendSourcePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "backend", "src")
    : path.join(projectRoot, "backend", "src");
}

function getDesktopIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", "phronon.ico")
    : path.join(desktopPublicPath, "icons", "phronon.ico");
}

function getRuntimeWorkingDirectory() {
  return app.isPackaged ? process.resourcesPath : projectRoot;
}

function getPythonCandidates(): PythonRuntime[] {
  if (process.env.PHRONON_PYTHON) {
    return [
      {
        command: process.env.PHRONON_PYTHON,
        args: []
      }
    ];
  }

  if (!app.isPackaged) {
    return process.platform === "win32"
      ? [
          {
            command: path.join(projectRoot, ".venv", "Scripts", "python.exe"),
            args: []
          }
        ]
      : [
          {
            command: path.join(projectRoot, ".venv", "bin", "python"),
            args: []
          }
        ];
  }

  if (process.platform === "win32") {
    return [
      {
        command: "py",
        args: ["-3.11"]
      },
      {
        command: "python",
        args: []
      }
    ];
  }

  return [
    {
      command: "python3",
      args: []
    },
    {
      command: "python",
      args: []
    }
  ];
}

function logPdfExtraction(message: string, details?: Record<string, unknown>) {
  if (!isDevMode()) {
    return;
  }

  if (details) {
    console.log("[phronon:pdf]", message, details);
    return;
  }

  console.log("[phronon:pdf]", message);
}

function logPdfExtractionError(message: string, details?: Record<string, unknown>) {
  if (!isDevMode()) {
    return;
  }

  if (details) {
    console.error("[phronon:pdf]", message, details);
    return;
  }

  console.error("[phronon:pdf]", message);
}

async function logAppEvent(message: string, details?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const detailText = details ? ` ${JSON.stringify(details)}` : "";
  const line = `${timestamp} ${message}${detailText}`;

  console.log(`[phronon:app] ${line}`);

  if (isDevMode()) {
    return;
  }

  try {
    const logDirectory = path.join(app.getPath("userData"), "logs");
    await mkdir(logDirectory, {
      recursive: true
    });
    await appendFile(path.join(logDirectory, "main.log"), `${line}\n`, "utf8");
  } catch {
    // Ignore logging failures so startup stays reliable.
  }
}

function normalizeBackendReason(reason: string | undefined): PdfExtractionFailureReason {
  switch (reason) {
    case "file_not_found":
    case "no_text":
    case "ocr_dependencies_missing":
    case "ocr_failed":
    case "ocr_no_text":
    case "read_error":
    case "unsupported_file":
      return reason;
    default:
      return "backend_error";
  }
}

function parseBackendOutput(stdout: string | undefined): PdfExtractionResult | null {
  if (!stdout) {
    return null;
  }

  try {
    const parsed = JSON.parse(stdout.trim()) as BackendJsonResponse;

    if (parsed.ok && typeof parsed.text === "string") {
      return {
        ok: true,
        text: parsed.text
      };
    }

    if (typeof parsed.error === "string") {
      return {
        ok: false,
        reason: normalizeBackendReason(parsed.reason),
        error: parsed.error
      };
    }
  } catch {
    return null;
  }

  return null;
}

function hasUsablePdfText(text: string) {
  const words = text.match(/\w+/gu) ?? [];
  const compactCharacters = text.replace(/\s+/gu, "");
  return words.length >= MIN_EXTRACTED_WORDS && compactCharacters.length >= MIN_EXTRACTED_CHARACTERS;
}

async function extractPdfTextWithBundledRenderer(filePath: string) {
  const pdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const fileBuffer = await readFile(filePath);
  const loadingTask = pdfJs.getDocument({
    data: new Uint8Array(fileBuffer),
    useWorkerFetch: false,
    isEvalSupported: false
  });
  const document = await loadingTask.promise;
  const extractedPages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);

      try {
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
          .join(" ")
          .replace(/\s+/gu, " ")
          .trim();

        if (pageText) {
          extractedPages.push(pageText);
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return extractedPages.join("\n\n").trim();
}

function createWindow() {
  const rendererIndexPath = path.join(__dirname, "../dist/index.html");
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: "Phronon",
    backgroundColor: "#f4f1eb",
    icon: getDesktopIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.PHRONON_RENDERER_URL;

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    void logAppEvent("Renderer did-fail-load.", {
      errorCode,
      errorDescription,
      validatedUrl,
      isMainFrame,
      rendererUrl,
      rendererIndexPath
    });
  });

  window.webContents.on("did-finish-load", () => {
    void logAppEvent("Renderer did-finish-load.", {
      currentUrl: window.webContents.getURL(),
      rendererUrl,
      rendererIndexPath
    });
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    void logAppEvent("Renderer process exited unexpectedly.", {
      reason: details.reason,
      exitCode: details.exitCode
    });
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      void logAppEvent("Renderer console message.", {
        level,
        message,
        line,
        sourceId
      });
    }
  });

  if (rendererUrl) {
    void logAppEvent("Loading renderer from development server.", {
      rendererUrl
    });
    void window.loadURL(rendererUrl);
  } else {
    void logAppEvent("Loading renderer from packaged file.", {
      rendererIndexPath
    });
    void window.loadFile(rendererIndexPath);
  }

  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });

  return window;
}

async function runPythonCommand(
  runtime: PythonRuntime,
  args: string[],
  options: {
    includeBackendSourcePath: boolean;
  }
) {
  const backendSourcePath = getBackendSourcePath();

  return execFileAsync(runtime.command, [...runtime.args, ...args], {
    cwd: getRuntimeWorkingDirectory(),
    env: {
      ...process.env,
      PYTHONPATH: options.includeBackendSourcePath
        ? process.env.PYTHONPATH
          ? `${backendSourcePath}${path.delimiter}${process.env.PYTHONPATH}`
          : backendSourcePath
        : process.env.PYTHONPATH
    }
  });
}

async function resolvePythonRuntime() {
  for (const candidate of getPythonCandidates()) {
    try {
      await runPythonCommand(candidate, ["--version"], {
        includeBackendSourcePath: false
      });
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function probeOptionalOcrSupport(): Promise<OcrProbeStatus> {
  const runtime = await resolvePythonRuntime();

  if (!runtime) {
    return {
      pythonAvailable: false,
      ocrPackagesAvailable: false,
      tesseractAvailable: false,
      arabicLanguageAvailable: false
    };
  }

  try {
    const { stdout } = await runPythonCommand(
      runtime,
      [
        "-c",
        [
          "import importlib.util, json",
          "status = {",
          "  'pythonAvailable': True,",
          "  'ocrPackagesAvailable': all(importlib.util.find_spec(module) is not None for module in ('pytesseract', 'pypdfium2', 'PIL')),",
          "  'tesseractAvailable': False,",
          "  'arabicLanguageAvailable': False",
          "}",
          "if status['ocrPackagesAvailable']:",
          "  try:",
          "    import pytesseract",
          "    languages = set(pytesseract.get_languages(config='') or [])",
          "    status['tesseractAvailable'] = True",
          "    status['arabicLanguageAvailable'] = 'ara' in languages",
          "  except Exception:",
          "    status['tesseractAvailable'] = False",
          "    status['arabicLanguageAvailable'] = False",
          "print(json.dumps(status))"
        ].join("; ")
      ],
      {
        includeBackendSourcePath: false
      }
    );
    return JSON.parse(stdout.trim()) as OcrProbeStatus;
  } catch {
    return {
      pythonAvailable: true,
      ocrPackagesAvailable: false,
      tesseractAvailable: false,
      arabicLanguageAvailable: false
    };
  }
}

async function collectRuntimeSupportStatus(): Promise<RuntimeSupportStatus> {
  const ocrProbe = await probeOptionalOcrSupport();
  const ocrSupportAvailable = ocrProbe.pythonAvailable && ocrProbe.ocrPackagesAvailable && ocrProbe.tesseractAvailable;
  const arabicOcrSupportAvailable = ocrSupportAvailable && ocrProbe.arabicLanguageAvailable;

  if (arabicOcrSupportAvailable) {
    return {
      isPackaged: app.isPackaged,
      coreAppReady: true,
      pdfSupportAvailable: true,
      ocrSupportAvailable: true,
      arabicOcrSupportAvailable: true,
      message:
        "You can start right away with TXT files, standard PDFs, scanned PDFs, and Arabic OCR on this device."
    };
  }

  if (ocrSupportAvailable) {
    return {
      isPackaged: app.isPackaged,
      coreAppReady: true,
      pdfSupportAvailable: true,
      ocrSupportAvailable: true,
      arabicOcrSupportAvailable: false,
      message:
        "TXT files, standard PDFs, and scanned PDFs work now. Arabic OCR still needs the Arabic language data for Tesseract."
    };
  }

  return {
    isPackaged: app.isPackaged,
    coreAppReady: true,
    pdfSupportAvailable: true,
    ocrSupportAvailable: false,
    arabicOcrSupportAvailable: false,
    message:
      "TXT files and standard text-based PDFs work right away. Scanned PDFs and Arabic OCR need optional local setup."
  };
}

async function extractPdfText(filePath: string): Promise<PdfExtractionResult> {
  try {
    const directPdfText = await extractPdfTextWithBundledRenderer(filePath);

    if (hasUsablePdfText(directPdfText)) {
      return {
        ok: true,
        text: directPdfText
      };
    }

    logPdfExtraction("Bundled PDF extraction did not find enough readable text. Trying OCR fallback.", {
      filePath
    });
  } catch (error) {
    logPdfExtractionError("Bundled PDF extraction failed.", {
      filePath,
      errorMessage: error instanceof Error ? error.message : String(error)
    });

    return {
      ok: false,
      reason: "read_error",
      error: "Phronon could not read that PDF. Please choose a readable PDF and try again."
    };
  }

  const runtime = await resolvePythonRuntime();

  if (!runtime) {
    return {
      ok: false,
      reason: "backend_invocation_failed",
      error: app.isPackaged
        ? "This PDF looks scanned. Standard text-based PDFs already work, but scanned PDFs need optional local OCR. Install Python 3.11 or newer, pytesseract, pypdfium2, Pillow, and Tesseract OCR to add that support."
        : "Phronon could not find the local OCR backend. Standard text-based PDFs still work, but scanned PDFs need the optional OCR setup."
    };
  }

  const backendArgs = ["-m", "phronon_backend", "ocr-extract-text", "--file", filePath];

  logPdfExtraction("Invoking backend for PDF extraction.", {
    pythonCommand: runtime.command,
    pythonArgs: runtime.args,
    backendArgs,
    filePath
  });

  try {
    const { stdout, stderr } = await runPythonCommand(runtime, backendArgs, {
      includeBackendSourcePath: true
    });
    const parsedResult = parseBackendOutput(stdout);

    if (parsedResult) {
      if (!parsedResult.ok) {
        logPdfExtraction("Backend reported a handled PDF extraction result.", {
          reason: parsedResult.reason,
          stderr: stderr.trim() || undefined
        });
      }

      return parsedResult;
    }

    logPdfExtractionError("Backend returned unexpected output.", {
      stdout: stdout.trim() || undefined,
      stderr: stderr.trim() || undefined
    });
  } catch (error) {
    const parsedResult = parseBackendOutput(
      error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string"
        ? error.stdout
        : undefined
    );

    if (parsedResult) {
      if (!parsedResult.ok) {
        logPdfExtraction("Backend returned a structured PDF extraction failure.", {
          reason: parsedResult.reason,
          stderr:
            error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
              ? error.stderr.trim() || undefined
              : undefined
        });
      }

      return parsedResult;
    }

    logPdfExtractionError("Failed to invoke backend for PDF extraction.", {
      pythonCommand: runtime.command,
      pythonArgs: runtime.args,
      filePath,
      errorMessage: error instanceof Error ? error.message : String(error),
      stdout:
        error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string"
          ? error.stdout.trim() || undefined
          : undefined,
      stderr:
        error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
          ? error.stderr.trim() || undefined
          : undefined
    });

    return {
      ok: false,
      reason: "backend_invocation_failed",
      error: app.isPackaged
        ? "Phronon could not start optional OCR for this scanned PDF. Standard text-based PDFs still work, but scanned PDFs need Python 3.11 or newer, pytesseract, pypdfium2, Pillow, and Tesseract OCR."
        : "Phronon could not start the optional OCR tools for that PDF. Please check the local OCR setup and try again."
    };
  }

  return {
    ok: false,
    reason: "backend_error",
    error: "Phronon could not extract readable text from that PDF."
  };
}

async function openDocumentFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  try {
    if (extension === ".pdf") {
      const pdfResult = await extractPdfText(filePath);

      if (!pdfResult.ok) {
        return {
          canceled: false,
          error: pdfResult.error,
          filePath
        };
      }

      return {
        canceled: false,
        filePath,
        fileType: "pdf" as const,
        text: pdfResult.text
      };
    }

    const text = await readFile(filePath, "utf8");

    return {
      canceled: false,
      filePath,
      fileType: "txt" as const,
      text
    };
  } catch {
    return {
      canceled: false,
      error: "Phronon could not read that document. Please choose a readable .txt or .pdf file and try again.",
      filePath
    };
  }
}

ipcMain.handle("reader:open-document", async () => {
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showOpenDialog(window, {
        title: "Open a document",
        properties: ["openFile"],
        filters: [
          {
            name: "Supported documents",
            extensions: ["txt", "pdf"]
          },
          {
            name: "Text files",
            extensions: ["txt"]
          },
          {
            name: "PDF files",
            extensions: ["pdf"]
          }
        ]
      })
    : await dialog.showOpenDialog({
        title: "Open a document",
        properties: ["openFile"],
        filters: [
          {
            name: "Supported documents",
            extensions: ["txt", "pdf"]
          },
          {
            name: "Text files",
            extensions: ["txt"]
          },
          {
            name: "PDF files",
            extensions: ["pdf"]
          }
        ]
      });

  if (result.canceled || result.filePaths.length === 0) {
    return {
      canceled: true
    };
  }

  const [filePath] = result.filePaths;
  return openDocumentFromPath(filePath);
});

ipcMain.handle("reader:open-document-at-path", async (_event, filePath: string) => openDocumentFromPath(filePath));
ipcMain.handle("app:get-runtime-support-status", () => collectRuntimeSupportStatus());

if (process.platform === "win32") {
  app.setAppUserModelId("org.phronon.desktop");
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const existingWindow = BrowserWindow.getAllWindows()[0];

    if (!existingWindow) {
      createWindow();
      return;
    }

    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }

    existingWindow.show();
    existingWindow.focus();
  });

  app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
