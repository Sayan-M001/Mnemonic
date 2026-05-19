import type { CaptureEvent, QuizAttempt } from "../shared/types.js";

export interface QuizRepository {
  addEvents(events: CaptureEvent[]): Promise<void>;
  listRecentEvents(limit: number): Promise<CaptureEvent[]>;
  saveAttempt(attempt: QuizAttempt): Promise<void>;
  getLatestAttempt(): Promise<QuizAttempt | null>;
}

export class InMemoryQuizRepository implements QuizRepository {
  private events: CaptureEvent[] = [];
  private attempts: QuizAttempt[] = [];

  async addEvents(events: CaptureEvent[]) {
    this.events = [...events, ...this.events].slice(0, 100);
  }

  async listRecentEvents(limit: number) {
    return this.events.slice(0, limit);
  }

  async saveAttempt(attempt: QuizAttempt) {
    this.attempts = [attempt, ...this.attempts].slice(0, 25);
  }

  async getLatestAttempt() {
    return this.attempts[0] ?? null;
  }
}
