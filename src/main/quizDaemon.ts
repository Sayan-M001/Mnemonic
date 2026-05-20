import { BrowserWindow, Notification } from "electron";
import { classifySensitivity, collectEnabledCaptureEvents, getPermissionSnapshot } from "./captureService.js";
import type { QuizRepository } from "./quizRepository.js";
import { generateQuizAttempt } from "./quizGenerator.js";
import type { CaptureEvent, CaptureSettings, DebugSnapshot } from "../shared/types.js";
import { randomUUID } from "node:crypto";

type DaemonOptions = {
  repository: QuizRepository;
  dataPath: string;
  captureAssetsDir: string;
  intervalMs?: number;
  getDebugWindow: () => BrowserWindow | null;
  openDebugWindow: () => Promise<BrowserWindow>;
};

export class QuizDaemon {
  private interval: NodeJS.Timeout | null = null;
  private lastRunAt: string | null = null;
  private nextRunAt: string | null = null;
  private readonly intervalMs: number;
  private lastNotifiedSourceSignature: string | null = null;

  constructor(private readonly options: DaemonOptions) {
    this.intervalMs = options.intervalMs ?? 30_000;
  }

  start() {
    if (this.interval) {
      return;
    }

    void this.runNow();
    this.interval = setInterval(() => void this.runOnce(), this.intervalMs);
    this.scheduleNextRun();
  }

  stop() {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
    this.nextRunAt = null;
  }

  async getSnapshot(): Promise<DebugSnapshot> {
    return {
      latestAttempt: await this.options.repository.getLatestAttempt(),
      events: await this.options.repository.listRecentEvents(20),
      settings: await this.options.repository.getSettings(),
      permissions: await getPermissionSnapshot(),
      daemon: {
        running: Boolean(this.interval),
        lastRunAt: this.lastRunAt,
        nextRunAt: this.nextRunAt,
        intervalMs: this.intervalMs,
        dataPath: this.options.dataPath
      }
    };
  }

  async runNow() {
    await this.runOnce();
    return this.getSnapshot();
  }

  async updateSettings(settings: CaptureSettings) {
    await this.options.repository.saveSettings(settings);
    await this.broadcastSnapshot();
  }


  async clearLocalData() {
    this.lastNotifiedSourceSignature = null;
    await this.options.repository.clearAll();
    await this.broadcastSnapshot();
  }

  private async runOnce() {
    this.lastRunAt = new Date().toISOString();

    const settings = await this.options.repository.getSettings();
    const recentEvents = await this.options.repository.listRecentEvents(20);
    const capturedEvents = await collectEnabledCaptureEvents(settings, recentEvents, this.options.captureAssetsDir);

    for (const event of capturedEvents) {
      await this.options.repository.addEvent(event);
    }

    const events = settings.capturePaused ? [] : await this.options.repository.listRecentEvents(10);
    const attempt = hasAnyCaptureSourceEnabled(settings)
      ? generateQuizAttempt(events)
      : {
          id: randomUUID(),
          status: "blocked" as const,
          createdAt: new Date().toISOString(),
          reason: "No capture sources are enabled yet. Turn on Manual Notes to start with explicit user-provided context.",
          sourceEvents: [],
          questions: []
        };

    await this.options.repository.saveAttempt(attempt);

    const sourceSignature = attempt.sourceEvents.map((event) => event.id).join(":");
    if (attempt.status === "quiz_ready" && sourceSignature !== this.lastNotifiedSourceSignature) {
      this.lastNotifiedSourceSignature = sourceSignature;
      new Notification({
        title: "Mnemonic quiz ready",
        body: `${attempt.questions.length} questions generated from your saved context.`
      }).show();
    }

    await this.broadcastSnapshot();
    this.scheduleNextRun();
  }

  private async broadcastSnapshot() {
    const debugWindow = this.options.getDebugWindow();
    debugWindow?.webContents.send("debug:snapshot-updated", await this.getSnapshot());
  }

  private scheduleNextRun() {
    this.nextRunAt = new Date(Date.now() + this.intervalMs).toISOString();
  }
}

function hasAnyCaptureSourceEnabled(settings: CaptureSettings) {
  return (
    settings.clipboardEnabled ||
    settings.activeWindowEnabled ||
    settings.audioCaptureEnabled
  );
}
