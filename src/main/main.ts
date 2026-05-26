import { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu, screen, Notification } from "electron";
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
  requestScreenPermission,
  openAccessibilitySettings
} from "./captureService.js";
import type { CaptureSettings } from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
ensureLocalEnvLoaded();
app.name = "Mnemonic";
const isDev = !app.isPackaged;

let debugWindow: BrowserWindow | null = null;
let quizPopupWindow: BrowserWindow | null = null;
let isAnimatingQuizWindow = false;
let tray: Tray | null = null;

const dataPath = path.join(app.getPath("userData"), "mnemonic-store.json");
const captureAssetsDir = path.join(app.getPath("userData"), "captures");
const repository = new LocalJsonQuizRepository(dataPath);
const captureIntervalMs = resolveIntervalMs({
  sharedKey: "MNEMONIC_CAPTURE_INTERVAL_MS",
  devKey: "MNEMONIC_CAPTURE_INTERVAL_MS",
  prodKey: "MNEMONIC_CAPTURE_INTERVAL_MS",
  defaultDevMs: 10_000,
  defaultProdMs: 30_000
});
const quizIntervalMs = resolveIntervalMs({
  sharedKey: "MNEMONIC_QUIZ_INTERVAL_MS",
  devKey: "MNEMONIC_QUIZ_INTERVAL_MS",
  prodKey: "MNEMONIC_QUIZ_INTERVAL_MS",
  defaultDevMs: 60 * 60 * 1000,
  defaultProdMs: 60 * 60 * 1000
});
const daemon = new QuizDaemon({
  repository,
  dataPath,
  captureAssetsDir,
  intervalMs: captureIntervalMs,
  quizIntervalMs,
  getDebugWindow: () => debugWindow,
  openDebugWindow: createDebugWindow,
  openQuizPopupWindow: createQuizPopupWindow
});

async function createDebugWindow() {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.show();
    debugWindow.focus();
    if (app.dock) {
      app.dock.show();
    }
    return debugWindow;
  }

  if (app.dock) {
    app.dock.show();
  }

  debugWindow = new BrowserWindow({
    width: 980,
    height: 600,
    minWidth: 840,
    minHeight: 520,
    title: "Mnemonic",
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  debugWindow.on("closed", () => {
    debugWindow = null;
    if (app.dock && !quizPopupWindow) {
      app.dock.hide();
    }
  });

  await loadRendererWindow(debugWindow, "dashboard");

  if (isDev) {
    debugWindow.webContents.openDevTools({ mode: "detach" });
  }

  return debugWindow;
}

async function createQuizPopupWindow(attemptId: string) {
  if (quizPopupWindow && !quizPopupWindow.isDestroyed()) {
    slideInQuizWindow(quizPopupWindow);
    return quizPopupWindow;
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { height } = display.workArea;

  quizPopupWindow = new BrowserWindow({
    width: 380,
    height: height,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    title: "Mnemonic Quiz",
    frame: false,
    transparent: true,
    vibrancy: "sidebar",
    visualEffectState: "active",
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  quizPopupWindow.on("closed", () => {
    quizPopupWindow = null;
    isAnimatingQuizWindow = false;
    if (app.dock && !debugWindow) {
      app.dock.hide();
    }
  });

  await loadRendererWindow(quizPopupWindow, "quiz-popup");
  slideInQuizWindow(quizPopupWindow);
  return quizPopupWindow;
}

async function createTray() {
  const trayIcon = await createTrayIcon();
  tray = new Tray(trayIcon);
  tray.setToolTip("Mnemonic is running in the background");
  
  tray.on("click", () => {
    void createDebugWindow();
  });

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
        label: "Quit",
        click: () => app.quit()
      }
    ])
  );
}

ipcMain.handle("debug:get-snapshot", () => daemon.getSnapshot());
ipcMain.handle("settings:update", (_event, settings: CaptureSettings) => daemon.updateSettings(settings));
ipcMain.handle("data:clear-local", () => daemon.clearLocalData());
ipcMain.handle("window:open-dashboard", () => createDebugWindow().then(() => undefined));
ipcMain.handle("window:close-self", (event) => {
  const currentWindow = BrowserWindow.fromWebContents(event.sender);
  if (currentWindow === quizPopupWindow && quizPopupWindow) {
    slideOutAndCloseQuizWindow(quizPopupWindow);
  } else {
    currentWindow?.close();
  }
});
ipcMain.handle("quiz-popup:snooze", async (_event, attemptId: string) => {
  if (quizPopupWindow) {
    slideOutAndCloseQuizWindow(quizPopupWindow);
  }
});
ipcMain.handle("quiz-popup:complete", async (_event, attemptId: string) => {
  if (quizPopupWindow) {
    slideOutAndCloseQuizWindow(quizPopupWindow);
  }
});
async function checkPermissionsAndStartDaemon() {
  const permissions = await getPermissionSnapshot();
  if (permissions.screen === "granted" && permissions.accessibility === "granted") {
    daemon.start();
  }
}

ipcMain.handle("permissions:get", async () => {
  const snapshot = await getPermissionSnapshot();
  if (snapshot.screen === "granted" && snapshot.accessibility === "granted") {
    daemon.start();
  }
  return snapshot;
});
ipcMain.handle("permissions:request-screen", async () => {
  const snapshot = await requestScreenPermission();
  if (snapshot.screen === "granted" && snapshot.accessibility === "granted") {
    daemon.start();
  }
  return snapshot;
});
ipcMain.handle("permissions:request-microphone", () => requestMicrophonePermission());
ipcMain.handle("permissions:request-accessibility", async () => {
  const snapshot = await requestAccessibilityPermission();
  if (snapshot.screen === "granted" && snapshot.accessibility === "granted") {
    daemon.start();
  }
  return snapshot;
});
ipcMain.handle("permissions:open-screen-settings", () => openScreenRecordingSettings());
ipcMain.handle("permissions:open-accessibility-settings", () => openAccessibilitySettings());


ipcMain.handle("asset:read-image", async (_event, imagePath: string) => {
  const bytes = await fs.readFile(imagePath);
  return `data:image/png;base64,${bytes.toString("base64")}`;
});
ipcMain.handle("asset:open-image", async (_event, imagePath: string) => {
  const { shell } = await import("electron");
  return shell.openPath(imagePath);
});

app.whenReady().then(async () => {
  if (app.dock) {
    app.dock.hide();
  }
  await createTray();
  await createDebugWindow();
  await checkPermissionsAndStartDaemon();

  try {
    const settings = await repository.getSettings();
    if (!settings.welcomeNotificationSent) {
      new Notification({
        title: "Mnemonic Notifications",
        body: "Notifications are now active for recall quizzes."
      }).show();

      await repository.saveSettings({
        ...settings,
        welcomeNotificationSent: true
      });
    }
  } catch (error) {
    console.error("Failed to check/send first-time welcome notification:", error);
  }
}).catch((error) => {
  console.error("Failed during Mnemonic startup:", error);
});

app.on("window-all-closed", () => {
  // By subscribing to this event and NOT calling app.quit(),
  // we prevent Electron from quitting, keeping the daemon alive in the background.
  debugWindow = null;
  quizPopupWindow = null;
});

app.on("activate", () => {
  // Use a short delay to allow any pending notification click handlers
  // to run and create the quiz sidebar window first.
  setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createDebugWindow();
    }
  }, 150);
});

app.on("before-quit", () => {
  daemon.stop();
});

async function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#1c1712"/>
      <circle cx="16" cy="16" r="9" fill="#39706f"/>
      <circle cx="16" cy="16" r="4" fill="#f3eadc"/>
    </svg>
  `;

  const tempWindow = new BrowserWindow({
    width: 32,
    height: 32,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true
    }
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;overflow:hidden;background:transparent;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        ${svg}
      </body>
    </html>
  `;

  await tempWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Wait a small moment to ensure standard rendering layout completes
  await new Promise((resolve) => setTimeout(resolve, 100));

  const captured = await tempWindow.webContents.capturePage({
    x: 0,
    y: 0,
    width: 32,
    height: 32
  });

  tempWindow.destroy();
  return captured.resize({ width: 18, height: 18 });
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

async function loadRendererWindow(window: BrowserWindow, view: "dashboard" | "quiz-popup") {
  if (isDev) {
    const url = new URL("http://127.0.0.1:5173");
    if (view === "quiz-popup") {
      url.searchParams.set("view", "quiz-popup");
    }
    await window.loadURL(url.toString());
    return;
  }

  await window.loadFile(path.join(__dirname, "../renderer/index.html"), {
    query: view === "quiz-popup" ? { view: "quiz-popup" } : {}
  });
}

function slideInQuizWindow(window: BrowserWindow) {
  if (isAnimatingQuizWindow) return;
  isAnimatingQuizWindow = true;

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const windowWidth = 380;

  window.setSize(windowWidth, height);
  const startX = x + width;
  const targetX = x + width - windowWidth;

  window.setPosition(startX, y);
  window.setAlwaysOnTop(true, "floating");
  window.show();
  window.focus();

  const duration = 250; // ms
  const startTime = Date.now();

  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Cubic ease-out
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentX = Math.round(startX - (startX - targetX) * easeProgress);

    if (!window.isDestroyed()) {
      window.setBounds({ x: currentX, y, width: windowWidth, height });
    }

    if (progress >= 1) {
      clearInterval(timer);
      isAnimatingQuizWindow = false;
    }
  }, 8);
}

function slideOutAndCloseQuizWindow(window: BrowserWindow, callback?: () => void) {
  if (isAnimatingQuizWindow) {
    if (!window.isDestroyed()) {
      window.close();
    }
    return;
  }
  isAnimatingQuizWindow = true;

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const windowWidth = 380;

  const currentBounds = window.getBounds();
  const startX = currentBounds.x;
  const targetX = x + width; // off-screen

  const duration = 200; // ms
  const startTime = Date.now();

  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Cubic ease-in
    const easeProgress = Math.pow(progress, 3);
    const currentX = Math.round(startX + (targetX - startX) * easeProgress);

    if (!window.isDestroyed()) {
      window.setBounds({ x: currentX, y: currentBounds.y, width: windowWidth, height });
    }

    if (progress >= 1) {
      clearInterval(timer);
      isAnimatingQuizWindow = false;
      if (!window.isDestroyed()) {
        window.close();
      }
      if (callback) callback();
    }
  }, 8);
}
