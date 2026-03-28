import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("phronon", {
  appName: "Phronon",
  openTextDocument: () => ipcRenderer.invoke("reader:open-text-document")
});
