import { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { LocalJsonQuizRepository } from "./quizRepository.js";
import { QuizDaemon } from "./quizDaemon.js";
import { ensureLocalEnvLoaded } from "./env.js";
import {
  getPermissionSnapshot,
  openScreenRecordingSettings,
  requestAccessibilityPermission,
  requestMicrophonePermission,
  requestScreenPermission
} from "./captureService.js";
import type { CaptureSettings } from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
ensureLocalEnvLoaded();
const isDev = !app.isPackaged;

let debugWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const dataPath = path.join(app.getPath("userData"), "mnemonic-store.json");
const captureAssetsDir = path.join(app.getPath("userData"), "captures");
const repository = new LocalJsonQuizRepository(dataPath);
const daemon = new QuizDaemon({
  repository,
  dataPath,
  captureAssetsDir,
  intervalMs: resolveIntervalMs({
    sharedKey: "MNEMONIC_CAPTURE_INTERVAL_MS",
    devKey: "MNEMONIC_CAPTURE_INTERVAL_MS",
    prodKey: "MNEMONIC_CAPTURE_INTERVAL_MS",
    defaultDevMs: 10_000,
    defaultProdMs: 30_000
  }),
  quizIntervalMs: resolveIntervalMs({
    sharedKey: "MNEMONIC_QUIZ_INTERVAL_MS",
    devKey: "MNEMONIC_QUIZ_INTERVAL_MS",
    prodKey: "MNEMONIC_QUIZ_INTERVAL_MS",
    defaultDevMs: 60 * 60 * 1000,
    defaultProdMs: 60 * 60 * 1000
  }),
  getDebugWindow: () => debugWindow,
  openDebugWindow: createDebugWindow
});

async function createDebugWindow() {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.show();
    debugWindow.focus();
    return debugWindow;
  }

  debugWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: "Mnemonic",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  debugWindow.on("closed", () => {
    debugWindow = null;
  });

  if (isDev) {
    await debugWindow.loadURL("http://127.0.0.1:5173");
    debugWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await debugWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return debugWindow;
}

function createTray() {
  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);
  tray.setToolTip("Mnemonic is running in the background");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Mnemonic: Running",
        enabled: false
      },
      {
        type: "separator"
      },
      {
        label: "Open App",
        click: () => void createDebugWindow()
      },
      {
        label: "Run Quiz Check Now",
        click: () => void daemon.runNow()
      },
      {
        label: "Quit",
        click: () => app.quit()
      }
    ])
  );
}

ipcMain.handle("debug:get-snapshot", () => daemon.getSnapshot());
ipcMain.handle("settings:update", (_event, settings: CaptureSettings) => daemon.updateSettings(settings));
ipcMain.handle("data:clear-local", () => daemon.clearLocalData());
ipcMain.handle("daemon:run-now", () => daemon.runNow());
ipcMain.handle("permissions:get", () => getPermissionSnapshot());
ipcMain.handle("permissions:request-screen", () => requestScreenPermission());
ipcMain.handle("permissions:request-microphone", () => requestMicrophonePermission());
ipcMain.handle("permissions:request-accessibility", () => requestAccessibilityPermission());
ipcMain.handle("permissions:open-screen-settings", () => openScreenRecordingSettings());
ipcMain.handle("asset:read-image", async (_event, imagePath: string) => {
  const bytes = await fs.readFile(imagePath);
  return `data:image/png;base64,${bytes.toString("base64")}`;
});
ipcMain.handle("asset:open-image", async (_event, imagePath: string) => {
  const { shell } = await import("electron");
  return shell.openPath(imagePath);
});

app.whenReady().then(async () => {
  createTray();
  await createDebugWindow();
  daemon.start();
});

app.on("window-all-closed", () => {
  debugWindow = null;
});

app.on("before-quit", () => {
  daemon.stop();
});

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#1c1712"/>
      <circle cx="16" cy="16" r="9" fill="#39706f"/>
      <circle cx="16" cy="16" r="4" fill="#f3eadc"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function resolveIntervalMs({
  sharedKey,
  devKey,
  prodKey,
  defaultDevMs,
  defaultProdMs
}: {
  sharedKey: string;
  devKey: string;
  prodKey: string;
  defaultDevMs: number;
  defaultProdMs: number;
}) {
  const rawValue =
    process.env[sharedKey] ??
    (isDev ? process.env[devKey] : process.env[prodKey]);

  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 1_000) {
    return parsed;
  }

  return isDev ? defaultDevMs : defaultProdMs;
}
