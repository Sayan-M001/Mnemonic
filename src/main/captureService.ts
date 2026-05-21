import { clipboard, desktopCapturer, shell, systemPreferences } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { CaptureEvent, CaptureSettings, PermissionSnapshot, PermissionState } from "../shared/types.js";
import { extractTextFromImage } from "./ocrService.js";

const MIN_CLIPBOARD_LENGTH = 12;
const BLOCKED_WINDOW_PATTERNS = [/1password/i, /keychain/i, /password/i, /private browsing/i, /incognito/i];
const execFileAsync = promisify(execFile);

export async function collectEnabledCaptureEvents(
  settings: CaptureSettings,
  recentEvents: CaptureEvent[],
  captureAssetsDir: string
): Promise<CaptureEvent[]> {
  if (settings.capturePaused) {
    return [];
  }

  const events: CaptureEvent[] = [];

  if (settings.clipboardEnabled) {
    const clipboardEvent = collectClipboardEvent(recentEvents);
    if (clipboardEvent) {
      events.push(clipboardEvent);
    }
  }

  if (settings.activeWindowEnabled) {
    const windowEvent = await collectWindowSourceEvent(captureAssetsDir);
    if (windowEvent) {
      events.push(windowEvent);
    }
  }

  return events;
}

export async function getPermissionSnapshot(): Promise<PermissionSnapshot> {
  return {
    screen: getMediaStatus("screen"),
    microphone: getMediaStatus("microphone"),
    accessibility: await getAccessibilityStatus(),
    checkedAt: new Date().toISOString()
  };
}

export async function requestScreenPermission(): Promise<PermissionSnapshot> {
  const current = await getPermissionSnapshot();
  if (current.screen === "granted") {
    return current;
  }

  try {
    await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 64, height: 64 }
    });
  } catch {
    // The returned permission snapshot below is the source of truth for the UI.
  }

  const next = await getPermissionSnapshot();
  if (next.screen !== "granted") {
    await openScreenRecordingSettings();
  }

  return next;
}

export async function requestAccessibilityPermission(): Promise<PermissionSnapshot> {
  const current = await getPermissionSnapshot();
  if (current.accessibility === "granted") {
    return current;
  }

  await openAccessibilitySettings();
  return getPermissionSnapshot();
}

export async function openScreenRecordingSettings() {
  await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
}

export async function requestMicrophonePermission(): Promise<PermissionSnapshot> {
  if (process.platform === "darwin") {
    await systemPreferences.askForMediaAccess("microphone");
  }

  return getPermissionSnapshot();
}

export function classifySensitivity(content: string): CaptureEvent["sensitivity"] {
  const highRiskPattern = /(password|otp|ssn|credit card|secret|api key|token|recovery phrase|private key)/i;
  const mediumRiskPattern = /(email|phone|address|bank|salary|medical|health|invoice|client)/i;

  if (highRiskPattern.test(content)) {
    return "high";
  }

  if (mediumRiskPattern.test(content)) {
    return "medium";
  }

  return "low";
}

function collectClipboardEvent(recentEvents: CaptureEvent[]): CaptureEvent | null {
  const text = clipboard.readText().trim();

  if (text.length < MIN_CLIPBOARD_LENGTH) {
    return null;
  }

  const sensitivity = classifySensitivity(text);
  const content = sensitivity === "high" ? "Clipboard text looked sensitive and was skipped by Mnemonic." : text;
  const latestClipboardEvent = recentEvents.find((event) => event.source === "clipboard");

  if (latestClipboardEvent?.content === content) {
    return null;
  }

  return createEvent("clipboard", content, sensitivity);
}

async function collectWindowSourceEvent(captureAssetsDir: string): Promise<CaptureEvent | null> {
  const activeWindow = await getActiveWindowViaAppleScript();
  if (activeWindow) {
    const appName = activeWindow.appName;
    const windowTitle = activeWindow.windowTitle;
    
    if (BLOCKED_WINDOW_PATTERNS.some((pattern) => pattern.test(windowTitle ?? appName))) {
      return null;
    }

    const contentParts: string[] = [];
    contentParts.push(`Frontmost app is ${appName}`);
    if (windowTitle) {
      contentParts.push(`window "${windowTitle}"`);
    }
    if (activeWindow.tabTitle || activeWindow.url) {
      const tabName = activeWindow.tabTitle || "Active Tab";
      const urlStr = activeWindow.url ? ` (${activeWindow.url})` : "";
      contentParts.push(`browser tab "${tabName}"${urlStr}`);
    }
    if (activeWindow.uiText) {
      contentParts.push(`\nVisible text:\n${activeWindow.uiText}`);
    }

    const screenshotPath = await captureWindowPreview({
      appName,
      windowTitle,
      captureAssetsDir
    });
    const ocrResult = screenshotPath ? await extractTextFromImage(screenshotPath) : null;
    const ocrText = normalizeOCRText(ocrResult?.fullText);

    if (ocrText && ocrText !== activeWindow.uiText) {
      contentParts.push(`\nOCR text:\n${ocrText}`);
    }

    let content = contentParts.join(". ");
    const sensitivity = classifySensitivity(content);
    if (sensitivity === "high") {
      content = `Frontmost app is ${appName}. Content was redacted due to high sensitivity.`;
    }

    return createEvent("active_window", content, sensitivity, {
      appName,
      windowTitle,
      url: activeWindow.url,
      tabTitle: activeWindow.tabTitle,
      uiText: sensitivity === "high" ? undefined : activeWindow.uiText,
      screenshotPath,
      ocrText: sensitivity === "high" ? undefined : ocrText,
      ocrBlocks: sensitivity === "high" ? undefined : ocrResult?.blocks,
      ocrAverageConfidence: sensitivity === "high" ? undefined : ocrResult?.averageConfidence,
      ocrImageSize: sensitivity === "high" ? undefined : ocrResult?.imageSize
    });
  }

  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 1, height: 1 },
    fetchWindowIcons: false
  });

  const names = sources
    .map((source) => source.name.trim())
    .filter(Boolean)
    .filter((name) => !BLOCKED_WINDOW_PATTERNS.some((pattern) => pattern.test(name)))
    .slice(0, 6);

  if (names.length === 0) {
    return null;
  }

  const content = `Open desktop windows visible to Mnemonic: ${names.join(", ")}.`;
  return createEvent("active_window", content, classifySensitivity(content), {
    windowTitle: names.join(", ")
  });
}

async function captureWindowPreview({
  appName,
  windowTitle,
  captureAssetsDir
}: {
  appName: string;
  windowTitle?: string;
  captureAssetsDir: string;
}): Promise<string | undefined> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 2048, height: 1280 },
      fetchWindowIcons: false
    });

    const preferredSource = chooseWindowSource(sources, appName, windowTitle);
    if (!preferredSource || preferredSource.thumbnail.isEmpty()) {
      return undefined;
    }

    return saveWindowPreview(preferredSource.thumbnail.toPNG(), captureAssetsDir);
  } catch {
    return undefined;
  }
}

function createEvent(
  source: CaptureEvent["source"],
  content: string,
  sensitivity: CaptureEvent["sensitivity"],
  metadata?: CaptureEvent["metadata"]
): CaptureEvent {
  return {
    id: randomUUID(),
    capturedAt: new Date().toISOString(),
    source,
    content,
    sensitivity,
    metadata
  };
}

function getMediaStatus(mediaType: "screen" | "microphone"): PermissionState {
  return systemPreferences.getMediaAccessStatus(mediaType);
}

async function saveWindowPreview(bytes: Buffer, captureAssetsDir: string) {
  await fs.mkdir(captureAssetsDir, { recursive: true });
  const filePath = path.join(captureAssetsDir, `window-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  await fs.writeFile(filePath, bytes);
  return filePath;
}

function chooseWindowSource(
  sources: Electron.DesktopCapturerSource[],
  appName: string,
  windowTitle?: string
) {
  const normalizedWindowTitle = normalizeWindowMatch(windowTitle);
  const normalizedAppName = normalizeWindowMatch(appName);

  if (normalizedWindowTitle) {
    const exactTitleMatch = sources.find((source) => normalizeWindowMatch(source.name) === normalizedWindowTitle);
    if (exactTitleMatch) {
      return exactTitleMatch;
    }

    const partialTitleMatch = sources.find((source) => {
      const sourceName = normalizeWindowMatch(source.name);
      return sourceName.includes(normalizedWindowTitle) || normalizedWindowTitle.includes(sourceName);
    });
    if (partialTitleMatch) {
      return partialTitleMatch;
    }
  }

  if (normalizedAppName) {
    return sources.find((source) => normalizeWindowMatch(source.name).includes(normalizedAppName));
  }

  return undefined;
}

function normalizeWindowMatch(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeOCRText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function getAccessibilityStatus(): Promise<PermissionState> {
  if (process.platform !== "darwin") {
    return "unknown";
  }

  try {
    await getActiveWindowViaAppleScript();
    return "granted";
  } catch {
    return "denied";
  }
}

async function openAccessibilitySettings() {
  await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
}

async function getActiveWindowViaAppleScript(): Promise<{
  appName: string;
  windowTitle?: string;
  url?: string;
  tabTitle?: string;
  uiText?: string;
} | null> {
  if (process.platform !== "darwin") {
    return { appName: "Unknown" };
  }

  const script = `
    tell application "System Events"
      set frontApp to first application process whose frontmost is true
      set appName to name of frontApp
      set winTitle to ""
      try
        if (count of windows of frontApp) > 0 then
          set winTitle to name of front window of frontApp
        end if
      end try
    end tell

    set tabURL to ""
    set tabTitle to ""

    if appName is "Google Chrome" or appName is "Chrome" or appName is "Arc" or appName is "Brave Browser" or appName is "Microsoft Edge" then
      try
        set tabURL to (run script "tell application \\"" & appName & "\\" to get URL of active tab of front window")
        set tabTitle to (run script "tell application \\"" & appName & "\\" to get title of active tab of front window")
      end try
    else if appName is "Safari" then
      try
        set tabURL to (run script "tell application \\"Safari\\" to get URL of current tab of front window")
        set tabTitle to (run script "tell application \\"Safari\\" to get name of current tab of front window")
      end try
    end if

    set textItems to {}
    try
      tell application "System Events"
        tell frontApp
          if (count of windows) > 0 then
            tell front window
              try
                repeat with itemRef in (every static text)
                  try
                    set v to value of itemRef as string
                    if v is not "" and v is not "missing value" then copy v to end of textItems
                  end try
                end repeat
              end try
              try
                repeat with itemRef in (every text area)
                  try
                    set v to value of itemRef as string
                    if v is not "" and v is not "missing value" then copy v to end of textItems
                  end try
                end repeat
              end try
              try
                repeat with itemRef in (every text field)
                  try
                    set v to value of itemRef as string
                    if v is not "" and v is not "missing value" then copy v to end of textItems
                  end try
                end repeat
              end try
              try
                repeat with sa in (every scroll area)
                  try
                    repeat with itemRef in (every static text of sa)
                      try
                        set v to value of itemRef as string
                        if v is not "" and v is not "missing value" then copy v to end of textItems
                      end try
                    end repeat
                  end try
                  try
                    repeat with itemRef in (every text area of sa)
                      try
                        set v to value of itemRef as string
                        if v is not "" and v is not "missing value" then copy v to end of textItems
                      end try
                    end repeat
                  end try
                end repeat
              end try
            end tell
          end if
        end tell
      end tell
    end try

    set uiText to ""
    if (count of textItems) > 0 then
      set oldDelims to AppleScript's text item delimiters
      set AppleScript's text item delimiters to linefeed
      set uiText to textItems as string
      set AppleScript's text item delimiters to oldDelims
    end if

    return appName & "__MNEMONIC_SEPARATOR__" & winTitle & "__MNEMONIC_SEPARATOR__" & tabURL & "__MNEMONIC_SEPARATOR__" & tabTitle & "__MNEMONIC_SEPARATOR__" & uiText
  `;

  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: 3000 });
    const parts = stdout.trim().split("__MNEMONIC_SEPARATOR__");
    const appName = parts[0] || "Unknown";
    const windowTitle = parts[1] || undefined;
    const url = parts[2] || undefined;
    const tabTitle = parts[3] || undefined;
    const uiText = parts[4] || undefined;

    return {
      appName,
      windowTitle,
      url,
      tabTitle,
      uiText
    };
  } catch (error) {
    const logPath = "/Users/sayan/Library/Application Support/mnemonic-quiz-daemon/debug.log";
    try {
      await fs.appendFile(logPath, `[${new Date().toISOString()}] AppleScript Error: ${error instanceof Error ? error.stack : error}\n`);
    } catch (e) {
      // ignore log write failure
    }
    return null;
  }
}
