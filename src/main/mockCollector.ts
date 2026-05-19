import type { CaptureEvent } from "../shared/types.js";
import { randomUUID } from "node:crypto";

const samples = [
  "Sayan discussed building an Electron POC with a background daemon, native notifications, and a debug UI.",
  "The quiz app should explain when there is not enough personal context to generate a good quiz.",
  "Birju prefers seeing a notification whenever the quiz is ready during the POC.",
  "The debug UI should show generated Q&A or the data and reasoning used by the generator."
];

export function collectMockEvents(): CaptureEvent[] {
  const now = new Date();
  const index = Math.floor(now.getMinutes() / 15) % samples.length;

  return [
    {
      id: randomUUID(),
      capturedAt: now.toISOString(),
      source: "mock",
      content: samples[index],
      sensitivity: "low"
    }
  ];
}
