import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "../../..");
const backendSourcePath = path.join(projectRoot, "backend", "src");
const windowsProjectPython = path.join(projectRoot, ".venv", "Scripts", "python.exe");
const projectPython = path.join(projectRoot, ".venv", "bin", "python");
const desktopPublicPath = path.join(projectRoot, "apps", "desktop", "public");
const desktopIconPath = path.join(desktopPublicPath, "icons", "phronon.ico");

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

function isDevMode() {
  return !app.isPackaged || Boolean(process.env.PHRONON_RENDERER_URL);
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

function resolvePythonCommand() {
  if (process.env.PHRONON_PYTHON) {
    return process.env.PHRONON_PYTHON;
  }

  if (process.platform === "win32") {
    return windowsProjectPython;
  }

  return projectPython;
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

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    icon: desktopIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.PHRONON_RENDERER_URL;

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

async function extractPdfText(filePath: string): Promise<PdfExtractionResult> {
  const pythonCommand = resolvePythonCommand();
  const backendArgs = ["-m", "phronon_backend", "extract-text", "--file", filePath];

  logPdfExtraction("Invoking backend for PDF extraction.", {
    pythonCommand,
    backendArgs,
    filePath
  });

  try {
    const { stdout, stderr } = await execFileAsync(pythonCommand, backendArgs, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: process.env.PYTHONPATH
          ? `${backendSourcePath}${path.delimiter}${process.env.PYTHONPATH}`
          : backendSourcePath
      }
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
      pythonCommand,
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
      error:
        "Phronon could not extract text from that PDF. Please make sure the local Python backend is installed and try again."
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

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
