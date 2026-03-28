import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
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

ipcMain.handle("reader:open-text-document", async () => {
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showOpenDialog(window, {
        title: "Open a text document",
        properties: ["openFile"],
        filters: [
          {
            name: "Text files",
            extensions: ["txt"]
          }
        ]
      })
    : await dialog.showOpenDialog({
        title: "Open a text document",
        properties: ["openFile"],
        filters: [
          {
            name: "Text files",
            extensions: ["txt"]
          }
        ]
      });

  if (result.canceled || result.filePaths.length === 0) {
    return {
      canceled: true
    };
  }

  const [filePath] = result.filePaths;

  try {
    const text = await readFile(filePath, "utf8");

    return {
      canceled: false,
      filePath,
      text
    };
  } catch {
    return {
      canceled: false,
      error: "Phronon could not read that text file. Please choose a readable .txt file and try again."
    };
  }
});

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
