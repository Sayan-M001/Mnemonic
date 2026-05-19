import { contextBridge, ipcRenderer } from "electron";
import type { DebugSnapshot } from "../shared/types.js";

const api = {
  getSnapshot: () => ipcRenderer.invoke("debug:get-snapshot") as Promise<DebugSnapshot>,
  onSnapshotUpdated: (callback: (snapshot: DebugSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: DebugSnapshot) => callback(snapshot);
    ipcRenderer.on("debug:snapshot-updated", listener);
    return () => {
      ipcRenderer.removeListener("debug:snapshot-updated", listener);
    };
  }
};

contextBridge.exposeInMainWorld("mnemonic", api);

export type MnemonicApi = typeof api;
