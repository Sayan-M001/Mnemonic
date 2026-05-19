import { BrowserWindow, Notification } from "electron";
import { collectMockEvents } from "./mockCollector.js";
import type { QuizRepository } from "./quizRepository.js";
import { generateQuizAttempt } from "./quizGenerator.js";
import type { DebugSnapshot } from "../shared/types.js";

type DaemonOptions = {
  repository: QuizRepository;
  intervalMs?: number;
  getDebugWindow: () => BrowserWindow | null;
  openDebugWindow: () => Promise<BrowserWindow>;
};

export class QuizDaemon {
  private interval: NodeJS.Timeout | null = null;
  private lastRunAt: string | null = null;
  private nextRunAt: string | null = null;
  private readonly intervalMs: number;

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
      daemon: {
        running: Boolean(this.interval),
        lastRunAt: this.lastRunAt,
        nextRunAt: this.nextRunAt,
        intervalMs: this.intervalMs
      }
    };
  }

  async runNow() {
    await this.runOnce();
  }

  private async runOnce() {
    this.lastRunAt = new Date().toISOString();
    await this.options.repository.addEvents(collectMockEvents());

    const events = await this.options.repository.listRecentEvents(10);
    const attempt = generateQuizAttempt(events);
    await this.options.repository.saveAttempt(attempt);

    if (attempt.status === "quiz_ready") {
      new Notification({
        title: "Mnemonic quiz ready",
        body: `${attempt.questions.length} questions generated from recent context.`
      }).show();
    }

    const debugWindow = this.options.getDebugWindow();
    debugWindow?.webContents.send("debug:snapshot-updated", await this.getSnapshot());
    this.scheduleNextRun();
  }

  private scheduleNextRun() {
    this.nextRunAt = new Date(Date.now() + this.intervalMs).toISOString();
  }
}
