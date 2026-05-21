import { BrowserWindow, Notification } from "electron";
import { collectEnabledCaptureEvents, getPermissionSnapshot } from "./captureService.js";
import type { QuizRepository } from "./quizRepository.js";
import { generateSegmentsWithAI } from "./aiSegmentationService.js";
import { generateQuizAttemptWithAI } from "./aiQuizService.js";
import type { CaptureEvent, CaptureSettings, DebugSnapshot } from "../shared/types.js";
import { randomUUID } from "node:crypto";

type DaemonOptions = {
  repository: QuizRepository;
  dataPath: string;
  captureAssetsDir: string;
  intervalMs?: number;
  quizIntervalMs?: number;
  getDebugWindow: () => BrowserWindow | null;
  openDebugWindow: () => Promise<BrowserWindow>;
};

export class QuizDaemon {
  private interval: NodeJS.Timeout | null = null;
  private lastRunAt: string | null = null;
  private nextRunAt: string | null = null;
  private readonly intervalMs: number;
  private readonly quizIntervalMs: number;
  private lastQuizRunAt: string | null = null;
  private nextQuizRunAt: string | null = null;
  private lastNotifiedSourceSignature: string | null = null;
  private isRunning = false;

  constructor(private readonly options: DaemonOptions) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.quizIntervalMs = options.quizIntervalMs ?? 60 * 60 * 1000;
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
      segments: await this.options.repository.listRecentSegments(8),
      settings: await this.options.repository.getSettings(),
      permissions: await getPermissionSnapshot(),
      daemon: {
        running: Boolean(this.interval),
        lastRunAt: this.lastRunAt,
        nextRunAt: this.nextRunAt,
        intervalMs: this.intervalMs,
        quizIntervalMs: this.quizIntervalMs,
        lastQuizRunAt: this.lastQuizRunAt,
        nextQuizRunAt: this.nextQuizRunAt,
        dataPath: this.options.dataPath
      }
    };
  }

  async runNow() {
    await this.runOnce({ forceQuiz: true });
    return this.getSnapshot();
  }

  async updateSettings(settings: CaptureSettings) {
    await this.options.repository.saveSettings(settings);
    await this.broadcastSnapshot();
  }


  async clearLocalData() {
    this.lastNotifiedSourceSignature = null;
    this.lastQuizRunAt = null;
    this.nextQuizRunAt = null;
    await this.options.repository.clearAll();
    await this.broadcastSnapshot();
  }

  private async runOnce({ forceQuiz = false }: { forceQuiz?: boolean } = {}) {
    if (this.isRunning) {
      console.warn("QuizDaemon runOnce skipped: already running");
      return;
    }
    this.isRunning = true;
    try {
      this.lastRunAt = new Date().toISOString();

      const settings = await this.options.repository.getSettings();
      const recentEvents = await this.options.repository.listRecentEvents(20);
      const capturedEvents = await collectEnabledCaptureEvents(settings, recentEvents, this.options.captureAssetsDir);

      for (const event of capturedEvents) {
        await this.options.repository.addEvent(event);
      }

      if (this.shouldRunQuiz(forceQuiz)) {
        await this.runQuizCycle(settings);
      }

      await this.broadcastSnapshot();
      this.scheduleNextRun();
    } catch (error) {
      console.error("QuizDaemon runOnce failed:", error);
    } finally {
      this.isRunning = false;
    }
  }

  private async broadcastSnapshot() {
    const debugWindow = this.options.getDebugWindow();
    debugWindow?.webContents.send("debug:snapshot-updated", await this.getSnapshot());
  }

  private scheduleNextRun() {
    this.nextRunAt = new Date(Date.now() + this.intervalMs).toISOString();
    this.nextQuizRunAt = this.lastQuizRunAt
      ? new Date(new Date(this.lastQuizRunAt).getTime() + this.quizIntervalMs).toISOString()
      : new Date(Date.now() + this.quizIntervalMs).toISOString();
  }

  private shouldRunQuiz(forceQuiz: boolean) {
    if (forceQuiz) {
      return true;
    }

    if (!this.lastQuizRunAt) {
      return true;
    }

    return Date.now() - new Date(this.lastQuizRunAt).getTime() >= this.quizIntervalMs;
  }

  private async runQuizCycle(settings: CaptureSettings) {
    try {
      this.lastQuizRunAt = new Date().toISOString();
      const events = settings.capturePaused ? [] : await this.options.repository.listRecentEvents(500);
      const latestAttempt = await this.options.repository.getLatestAttempt();
      const attempt = hasAnyCaptureSourceEnabled(settings)
        ? await this.generateAttemptFromCurrentWindow(events)
        : {
            id: randomUUID(),
            status: "blocked" as const,
            createdAt: new Date().toISOString(),
            reason: "No capture sources are enabled yet. Turn on clipboard or frontmost window capture to start building context.",
            sourceEvents: [],
            sourceSegments: [],
            questions: [],
            generation: {
              source: "heuristic" as const,
              promptVersion: "system-default-v1"
            }
          };

      await this.options.repository.saveAttempt(attempt);

      const sourceSignature = (attempt.sourceSegments ?? [])
        .map((segment) => segment.id)
        .concat(attempt.sourceEvents.map((event) => event.id))
        .join(":");
      if (attempt.status === "quiz_ready" && sourceSignature !== this.lastNotifiedSourceSignature) {
        this.lastNotifiedSourceSignature = sourceSignature;
        new Notification({
          title: "Mnemonic quiz ready",
          body: `${attempt.questions.length} questions generated from your captured activity.`
        }).show();
      }

      if (latestAttempt?.id !== attempt.id) {
        this.scheduleNextRun();
      }
    } catch (error) {
      console.error("QuizDaemon runQuizCycle failed:", error);
    }
  }

  private async generateAttemptFromCurrentWindow(events: CaptureEvent[]) {
    try {
      const windowEvents = selectEventsForCurrentQuizWindow(events, this.quizIntervalMs);
      const segments = await generateSegmentsWithAI(windowEvents);
      try {
        await this.options.repository.saveSegments(segments);
      } catch (saveError) {
        console.error("Failed to save segments:", saveError);
      }
      return await generateQuizAttemptWithAI(windowEvents.length > 0 ? segments : [], windowEvents);
    } catch (error) {
      console.error("generateAttemptFromCurrentWindow failed:", error);
      return {
        id: randomUUID(),
        status: "blocked" as const,
        createdAt: new Date().toISOString(),
        reason: `Failed to generate quiz: ${error instanceof Error ? error.message : String(error)}`,
        sourceEvents: events.slice(0, 5),
        sourceSegments: [],
        questions: [],
        generation: {
          source: "ai" as const,
          promptVersion: "ai-quiz-v1",
          failureReason: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}

function hasAnyCaptureSourceEnabled(settings: CaptureSettings) {
  return (
    settings.clipboardEnabled ||
    settings.activeWindowEnabled
  );
}

function selectEventsForCurrentQuizWindow(events: readonly CaptureEvent[], quizIntervalMs: number): CaptureEvent[] {
  if (events.length === 0) {
    return [];
  }

  const newest = new Date(events[0].capturedAt).getTime();
  const cutoff = newest - quizIntervalMs;
  return events.filter((event) => new Date(event.capturedAt).getTime() >= cutoff);
}
