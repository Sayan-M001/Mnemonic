export type CaptureEvent = {
  id: string;
  capturedAt: string;
  source: "mock" | "clipboard" | "window" | "screen" | "audio";
  content: string;
  sensitivity: "low" | "medium" | "high";
};

export type QuizQuestion = {
  id: string;
  question: string;
  answer: string;
  sourceEventIds: string[];
};

export type QuizAttempt = {
  id: string;
  status: "quiz_ready" | "blocked";
  createdAt: string;
  reason: string;
  sourceEvents: CaptureEvent[];
  questions: QuizQuestion[];
};

export type DebugSnapshot = {
  latestAttempt: QuizAttempt | null;
  events: CaptureEvent[];
  daemon: {
    running: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    intervalMs: number;
  };
};
