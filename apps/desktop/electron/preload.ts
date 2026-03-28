import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("phronon", {
  appName: "Phronon"
});
