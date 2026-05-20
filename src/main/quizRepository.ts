import fs from "node:fs/promises";
import path from "node:path";
import type { CaptureEvent, CaptureSettings, QuizAttempt } from "../shared/types.js";

export interface QuizRepository {
  addEvent(event: CaptureEvent): Promise<void>;
  listRecentEvents(limit: number): Promise<CaptureEvent[]>;
  saveAttempt(attempt: QuizAttempt): Promise<void>;
  getLatestAttempt(): Promise<QuizAttempt | null>;
  getSettings(): Promise<CaptureSettings>;
  saveSettings(settings: CaptureSettings): Promise<void>;
  clearAll(): Promise<void>;
}

type StoreFile = {
  events: CaptureEvent[];
  attempts: QuizAttempt[];
  settings: CaptureSettings;
};

export const defaultCaptureSettings: CaptureSettings = {
  capturePaused: false,
  clipboardEnabled: false,
  activeWindowEnabled: false,
  screenCaptureEnabled: false,
  audioCaptureEnabled: false,
  retentionDays: 7
};

export class LocalJsonQuizRepository implements QuizRepository {
  constructor(private readonly filePath: string) {}

  get path() {
    return this.filePath;
  }

  async addEvent(event: CaptureEvent) {
    const store = await this.readStore();
    store.events = [event, ...this.filterRetainedEvents(store.events, store.settings.retentionDays)].slice(0, 5000);
    await this.writeStore(store);
  }

  async listRecentEvents(limit: number) {
    const store = await this.readStore();
    return this.filterRetainedEvents(store.events, store.settings.retentionDays).slice(0, limit);
  }

  async saveAttempt(attempt: QuizAttempt) {
    const store = await this.readStore();
    store.attempts = [attempt, ...store.attempts].slice(0, 50);
    await this.writeStore(store);
  }

  async getLatestAttempt() {
    const store = await this.readStore();
    return store.attempts[0] ?? null;
  }

  async getSettings() {
    const store = await this.readStore();
    return store.settings;
  }

  async saveSettings(settings: CaptureSettings) {
    const store = await this.readStore();
    store.settings = settings;
    await this.writeStore(store);
  }

  async clearAll() {
    await this.writeStore(this.createEmptyStore());
  }

  private async readStore(): Promise<StoreFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreFile>;

      return {
        events: parsed.events ?? [],
        attempts: parsed.attempts ?? [],
        settings: { ...defaultCaptureSettings, ...parsed.settings }
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        const store = this.createEmptyStore();
        await this.writeStore(store);
        return store;
      }

      throw error;
    }
  }

  private async writeStore(store: StoreFile) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }

  private createEmptyStore(): StoreFile {
    return {
      events: [],
      attempts: [],
      settings: defaultCaptureSettings
    };
  }

  private filterRetainedEvents(events: CaptureEvent[], retentionDays: number) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    return events.filter((event) => new Date(event.capturedAt).getTime() >= cutoff);
  }
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
