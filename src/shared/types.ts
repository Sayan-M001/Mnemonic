export type CaptureEvent = {
  id: string;
  capturedAt: string;
  source: "clipboard" | "active_window";
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
    structuredContext?: StructuredContext;
    url?: string;
    tabTitle?: string;
    uiText?: string;
  };
};

export type InterpreterSource = "ai" | "heuristic";

export type InterpreterInfo = {
  source: InterpreterSource;
  model?: string;
  promptVersion: string;
  failureReason?: string;
};

export type StructuredContext = {
  surfaceType: string;
  activityKind: string;
  entities: string[];
  subjects: string[];
  participants: string[];
  evidence: string[];
  artifacts: {
    titles: string[];
    files: string[];
    urls: string[];
    domains: string[];
    documents: string[];
  };
  resourceRefs: {
    filePaths: string[];
    urls: string[];
    domains: string[];
    repoNames: string[];
    issueIds: string[];
  };
  topicHints: string[];
  summary: string;
  confidence: number;
  dynamicContext: Record<string, string | number | boolean | string[] | null>;
  interpreter: InterpreterInfo;
};

export type ActivitySegment = {
  id: string;
  createdAt: string;
  windowStartAt: string;
  windowEndAt: string;
  title: string;
  surfaceType: string;
  activityKind: string;
  summary: string;
  entities: string[];
  subjects: string[];
  topicHints: string[];
  evidence: string[];
  sourceEventIds: string[];
  confidence: number;
  generation: InterpreterInfo;
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
  retentionDays: number;
};

export type QuizQuestion = {
  id: string;
  question: string;
  answer: string;
  options?: string[];
  sourceEventIds: string[];
  sourceSegmentIds?: string[];
};

export type QuizAttempt = {
  id: string;
  status: "quiz_ready" | "blocked";
  createdAt: string;
  reason: string;
  sourceEvents: CaptureEvent[];
  sourceSegments?: ActivitySegment[];
  questions: QuizQuestion[];
  generation?: InterpreterInfo;
};

export type DebugSnapshot = {
  latestAttempt: QuizAttempt | null;
  events: CaptureEvent[];
  segments: ActivitySegment[];
  settings: CaptureSettings;
  permissions: PermissionSnapshot;
  daemon: {
    running: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    intervalMs: number;
    quizIntervalMs: number;
    lastQuizRunAt: string | null;
    nextQuizRunAt: string | null;
    dataPath: string;
  };
};
