import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("phronon", {
  appName: "Phronon",
  openReaderDocument: () => ipcRenderer.invoke("reader:open-document")
});
