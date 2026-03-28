import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("phronon", {
  appName: "Phronon",
  openReaderDocument: () => ipcRenderer.invoke("reader:open-document"),
  openDocumentAtPath: (filePath: string) => ipcRenderer.invoke("reader:open-document-at-path", filePath)
});
