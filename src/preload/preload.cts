import { contextBridge, ipcRenderer } from "electron";
import type { CaptureSettings, DebugSnapshot, PermissionSnapshot } from "../shared/types.js";

const api = {
  getSnapshot: () => ipcRenderer.invoke("debug:get-snapshot") as Promise<DebugSnapshot>,
  updateSettings: (settings: CaptureSettings) => ipcRenderer.invoke("settings:update", settings) as Promise<void>,
  clearLocalData: () => ipcRenderer.invoke("data:clear-local") as Promise<void>,
  runNow: () => ipcRenderer.invoke("daemon:run-now") as Promise<DebugSnapshot>,
  getPermissions: () => ipcRenderer.invoke("permissions:get") as Promise<PermissionSnapshot>,
  requestScreenPermission: () => ipcRenderer.invoke("permissions:request-screen") as Promise<PermissionSnapshot>,
  requestMicrophonePermission: () =>
    ipcRenderer.invoke("permissions:request-microphone") as Promise<PermissionSnapshot>,
  requestAccessibilityPermission: () =>
    ipcRenderer.invoke("permissions:request-accessibility") as Promise<PermissionSnapshot>,
  openScreenRecordingSettings: () => ipcRenderer.invoke("permissions:open-screen-settings") as Promise<void>,
  readImageAsset: (imagePath: string) => ipcRenderer.invoke("asset:read-image", imagePath) as Promise<string>,
  openImageAsset: (imagePath: string) => ipcRenderer.invoke("asset:open-image", imagePath) as Promise<string>,
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
