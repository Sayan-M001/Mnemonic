import { BrowserWindow, Notification, app } from "electron";
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
  openQuizPopupWindow: (attemptId: string) => Promise<BrowserWindow>;
};

export class QuizDaemon {
  private interval: NodeJS.Timeout | null = null;
  private started = false;
  private lastRunAt: string | null = null;
  private nextRunAt: string | null = null;
  private readonly intervalMs: number;
  private quizIntervalMs: number;
  private minEventsForQuiz: number;
  private lastQuizRunAt: string | null = null;
  private nextQuizRunAt: string | null = null;
  private lastNotifiedSourceSignature: string | null = null;
  private isRunning = false;
  private activeNotification: Notification | null = null;

  constructor(private readonly options: DaemonOptions) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.quizIntervalMs = options.quizIntervalMs ?? 60 * 60 * 1000;

    const expectedEvents = Math.floor(this.quizIntervalMs / this.intervalMs);
    this.minEventsForQuiz = Math.max(1, Math.min(expectedEvents, Math.max(3, Math.floor(expectedEvents * 0.10))));
  }

  private updateQuizInterval(quizIntervalMs: number) {
    this.quizIntervalMs = quizIntervalMs;
    const expectedEvents = Math.floor(this.quizIntervalMs / this.intervalMs);
    this.minEventsForQuiz = Math.max(1, Math.min(expectedEvents, Math.max(3, Math.floor(expectedEvents * 0.10))));
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    
    this.options.repository.getSettings().then((settings) => {
      if (settings.quizIntervalMs) {
        this.updateQuizInterval(settings.quizIntervalMs);
      }
      this.scheduleNextRun();
      this.interval = setTimeout(() => {
        this.interval = null;
        void this.runOnce();
      }, this.intervalMs);
    }).catch((err) => {
      console.error("Failed to load settings at daemon start:", err);
      this.scheduleNextRun();
      this.interval = setTimeout(() => {
        this.interval = null;
        void this.runOnce();
      }, this.intervalMs);
    });
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;
    if (this.interval) {
      clearTimeout(this.interval);
    }
    this.interval = null;
    this.nextRunAt = null;
  }


  async getSnapshot(): Promise<DebugSnapshot> {
    return {
      latestAttempt: await this.options.repository.getLatestAttempt(),
      events: await this.options.repository.listRecentEvents(2000),
      segments: await this.options.repository.listRecentSegments(500),
      settings: await this.options.repository.getSettings(),
      permissions: await getPermissionSnapshot(),
      daemon: {
        running: this.started,
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


  async updateSettings(settings: CaptureSettings) {
    await this.options.repository.saveSettings(settings);
    if (settings.quizIntervalMs) {
      this.updateQuizInterval(settings.quizIntervalMs);
    }
    await this.broadcastSnapshot();
  }


  async clearLocalData() {
    this.lastNotifiedSourceSignature = null;
    this.lastQuizRunAt = null;
    this.nextQuizRunAt = null;
    await this.options.repository.clearAll();
    await this.broadcastSnapshot();
  }

  private async runOnce() {
    if (this.isRunning) {
      console.warn("QuizDaemon runOnce skipped: already running");
      return;
    }
    this.isRunning = true;
    try {
      this.lastRunAt = new Date().toISOString();

      const settings = await this.options.repository.getSettings();
      if (settings.quizIntervalMs) {
        this.updateQuizInterval(settings.quizIntervalMs);
      }
      const recentEvents = await this.options.repository.listRecentEvents(20);
      const capturedEvents = await collectEnabledCaptureEvents(settings, recentEvents, this.options.captureAssetsDir);

      for (const event of capturedEvents) {
        await this.options.repository.addEvent(event);
      }

      if (this.shouldRunQuiz()) {
        await this.runQuizCycle(settings);
      }

      await this.broadcastSnapshot();
    } catch (error) {
      console.error("QuizDaemon runOnce failed:", error);
    } finally {
      this.isRunning = false;
      this.scheduleFollowingRun();
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

  private scheduleFollowingRun() {
    if (!this.started) {
      return;
    }

    if (this.interval) {
      clearTimeout(this.interval);
      this.interval = null;
    }

    this.scheduleNextRun();
    this.interval = setTimeout(() => {
      this.interval = null;
      void this.runOnce();
    }, this.intervalMs);
  }

  private shouldRunQuiz() {
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
      const windowEvents = selectEventsForCurrentQuizWindow(events, this.quizIntervalMs);

      const latestAttemptTime = latestAttempt ? new Date(latestAttempt.createdAt).getTime() : 0;
      const newEvents = windowEvents.filter(
        (event) => new Date(event.capturedAt).getTime() > latestAttemptTime
      );

      if (newEvents.length < this.minEventsForQuiz) {
        console.log(`[QuizDaemon] Skipping background quiz cycle: Only ${newEvents.length} new events captured (requires at least ${this.minEventsForQuiz}).`);
        return;
      }



      const attempt = hasAnyCaptureSourceEnabled(settings)
        ? await this.generateAttemptFromCurrentWindow(events, latestAttemptTime)
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
        console.log("[QuizDaemon] Background quiz ready: sending notification");
        this.activeNotification = new Notification({
          title: "Mnemonic Quiz Ready",
          body: `${attempt.questions.length} recall questions are ready. Click to start your quiz.`
        });
        this.activeNotification.on("click", () => {
          console.log("[Notification] Clicked: opening quiz window");
          void this.options.openQuizPopupWindow(attempt.id);
          this.activeNotification = null;
        });
        this.activeNotification.on("show", () => {
          console.log("[Notification] Displayed successfully");
        });
        this.activeNotification.on("failed", (event, error) => {
          console.error("[Notification] Failed to show:", error);
          console.log("[Notification] Falling back to opening quiz window directly due to notification failure");
          void this.options.openQuizPopupWindow(attempt.id);
          this.activeNotification = null;
        });
        this.activeNotification.show();

        // macOS Dock bounce alert as backup
        if (process.platform === "darwin" && app.dock) {
          app.dock.bounce("informational");
        }
      }

      if (latestAttempt?.id !== attempt.id) {
        this.scheduleNextRun();
      }
    } catch (error) {
      console.error("QuizDaemon runQuizCycle failed:", error);
    }
  }

  private async generateAttemptFromCurrentWindow(events: CaptureEvent[], latestAttemptTime: number) {
    const windowEvents = selectEventsForCurrentQuizWindow(events, this.quizIntervalMs);
    const newEvents = windowEvents.filter(
      (event) => new Date(event.capturedAt).getTime() > latestAttemptTime
    );

    try {
      const segments = await generateSegmentsWithAI(newEvents);
      try {
        await this.options.repository.saveSegments(segments);
      } catch (saveError) {
        console.error("Failed to save segments:", saveError);
      }
      return await generateQuizAttemptWithAI(newEvents.length > 0 ? segments : [], newEvents);
    } catch (error) {
      console.error("generateAttemptFromCurrentWindow failed:", error);
      return {
        id: randomUUID(),
        status: "blocked" as const,
        createdAt: new Date().toISOString(),
        reason: `Failed to generate quiz: ${error instanceof Error ? error.message : String(error)}`,
        sourceEvents: newEvents,
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
