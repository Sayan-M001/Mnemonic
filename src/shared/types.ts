export type CaptureEvent = {
  id: string;
  capturedAt: string;
  source: "manual" | "clipboard" | "active_window" | "screen" | "audio";
  content: string;
  sensitivity: "low" | "medium" | "high";
  metadata?: {
    appName?: string;
    windowTitle?: string;
    screenshotPath?: string;
    ocrText?: string;
    ocrBlocks?: OCRTextBlock[];
    ocrAverageConfidence?: number;
    ocrImageSize?: {
      width: number;
      height: number;
    };
    displayName?: string;
    thumbnailSize?: {
      width: number;
      height: number;
    };
    url?: string;
    tabTitle?: string;
    uiText?: string;
  };
};

export type OCRTextBlock = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type PermissionState = "not-determined" | "granted" | "denied" | "restricted" | "unknown";

export type PermissionSnapshot = {
  screen: PermissionState;
  microphone: PermissionState;
  accessibility: PermissionState;
  checkedAt: string;
};

export type CaptureSettings = {
  capturePaused: boolean;
  clipboardEnabled: boolean;
  activeWindowEnabled: boolean;
  screenCaptureEnabled: boolean;
  audioCaptureEnabled: boolean;
  retentionDays: number;
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
  settings: CaptureSettings;
  permissions: PermissionSnapshot;
  daemon: {
    running: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    intervalMs: number;
    dataPath: string;
  };
};
