import fs from "node:fs/promises";
import path from "node:path";
import type { ActivitySegment, CaptureEvent, CaptureSettings, QuizAttempt } from "../shared/types.js";

export interface QuizRepository {
  addEvent(event: CaptureEvent): Promise<void>;
  listRecentEvents(limit: number): Promise<CaptureEvent[]>;
  saveSegments(segments: ActivitySegment[]): Promise<void>;
  listRecentSegments(limit: number): Promise<ActivitySegment[]>;
  saveAttempt(attempt: QuizAttempt): Promise<void>;
  getLatestAttempt(): Promise<QuizAttempt | null>;
  getSettings(): Promise<CaptureSettings>;
  saveSettings(settings: CaptureSettings): Promise<void>;
  clearAll(): Promise<void>;
}

type StoreFile = {
  events: CaptureEvent[];
  segments: ActivitySegment[];
  attempts: QuizAttempt[];
  settings: CaptureSettings;
};

export const defaultCaptureSettings: CaptureSettings = {
  capturePaused: false,
  clipboardEnabled: false,
  activeWindowEnabled: false,
  retentionDays: 7
};

export class LocalJsonQuizRepository implements QuizRepository {
  constructor(private readonly filePath: string) {}

  get path() {
    return this.filePath;
  }

  async addEvent(event: CaptureEvent) {
    const store = await this.readStore();
    const retainedEvents = this.filterRetainedEvents(store.events, store.settings.retentionDays);
    store.events = [event, ...retainedEvents].slice(0, 5000);
    await this.writeStore(store);
  }

  async listRecentEvents(limit: number) {
    const store = await this.readStore();
    return this.filterRetainedEvents(store.events, store.settings.retentionDays).slice(0, limit);
  }

  async saveSegments(segments: ActivitySegment[]) {
    if (segments.length === 0) {
      return;
    }

    const store = await this.readStore();
    const retainedSegments = this.filterRetainedSegments(store.segments, store.settings.retentionDays);
    store.segments = [...segments, ...retainedSegments].slice(0, 500);
    await this.writeStore(store);
  }

  async listRecentSegments(limit: number) {
    const store = await this.readStore();
    return this.filterRetainedSegments(store.segments, store.settings.retentionDays).slice(0, limit);
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
      const parsed = await this.parseStoreFile(raw);

      return {
        events: parsed.events ?? [],
        segments: parsed.segments ?? [],
        attempts: parsed.attempts ?? [],
        settings: normalizeSettings(parsed.settings)
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
    const nextRaw = `${JSON.stringify(store, null, 2)}\n`;
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, nextRaw, "utf8");
    await fs.rename(tempPath, this.filePath);
  }

  private createEmptyStore(): StoreFile {
    return {
      events: [],
      segments: [],
      attempts: [],
      settings: defaultCaptureSettings
    };
  }

  private filterRetainedEvents(events: CaptureEvent[], retentionDays: number) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    return events.filter((event) => new Date(event.capturedAt).getTime() >= cutoff);
  }

  private filterRetainedSegments(segments: ActivitySegment[], retentionDays: number) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    return segments.filter((segment) => new Date(segment.windowEndAt).getTime() >= cutoff);
  }

  private async parseStoreFile(raw: string): Promise<Partial<StoreFile>> {
    try {
      return JSON.parse(raw) as Partial<StoreFile>;
    } catch (error) {
      const repaired = tryRepairStoreJson(raw, error);
      await this.backupCorruptedStore(raw);

      if (repaired) {
        const repairedStore = {
          events: repaired.events ?? [],
          segments: repaired.segments ?? [],
          attempts: repaired.attempts ?? [],
          settings: normalizeSettings(repaired.settings)
        };

        await this.writeStore(repairedStore);
        return repairedStore;
      }

      const emptyStore = this.createEmptyStore();
      await this.writeStore(emptyStore);
      return emptyStore;
    }
  }

  private async backupCorruptedStore(raw: string) {
    const backupPath = `${this.filePath}.corrupt-${Date.now()}.json`;
    await fs.writeFile(backupPath, raw, "utf8");
  }
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function normalizeSettings(settings: Partial<CaptureSettings> | undefined): CaptureSettings {
  return {
    ...defaultCaptureSettings,
    ...(settings ?? {})
  };
}

function tryRepairStoreJson(raw: string, error: unknown): Partial<StoreFile> | null {
  const message = error instanceof Error ? error.message : "";
  const positionMatch = message.match(/position (\d+)/);

  if (positionMatch) {
    const position = Number(positionMatch[1]);
    const candidate = raw.slice(0, position).trimEnd();
    try {
      return JSON.parse(candidate) as Partial<StoreFile>;
    } catch {
      // Fall through to the generic repair attempt.
    }
  }

  const lastBrace = raw.lastIndexOf("}");
  if (lastBrace !== -1) {
    const candidate = raw.slice(0, lastBrace + 1);
    try {
      return JSON.parse(candidate) as Partial<StoreFile>;
    } catch {
      // Fall through to sanitization.
    }
  }

  const sanitized = sanitizeControlCharacters(raw);
  if (sanitized !== raw) {
    try {
      return JSON.parse(sanitized) as Partial<StoreFile>;
    } catch {
      // Fall through.
    }
  }

  return null;
}

function sanitizeControlCharacters(raw: string) {
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}
