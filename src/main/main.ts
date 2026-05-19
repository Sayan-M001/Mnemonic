import { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryQuizRepository } from "./quizRepository.js";
import { QuizDaemon } from "./quizDaemon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

let debugWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const repository = new InMemoryQuizRepository();
const daemon = new QuizDaemon({
  repository,
  intervalMs: 30_000,
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
    title: "Mnemonic Quiz Debugger",
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
  const trayIcon = nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setToolTip("Mnemonic Quiz Daemon");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Quiz Debugger",
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
