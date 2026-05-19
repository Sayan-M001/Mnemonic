import type { CaptureEvent, QuizAttempt, QuizQuestion } from "../shared/types.js";
import { randomUUID } from "node:crypto";

const MIN_USEFUL_EVENTS = 3;

export function generateQuizAttempt(events: CaptureEvent[]): QuizAttempt {
  const usefulEvents = events.filter((event) => event.sensitivity !== "high" && event.content.length > 40);
  const createdAt = new Date().toISOString();

  if (usefulEvents.length < MIN_USEFUL_EVENTS) {
    return {
      id: randomUUID(),
      status: "blocked",
      createdAt,
      reason: `Need at least ${MIN_USEFUL_EVENTS} low-risk context snippets; only found ${usefulEvents.length}.`,
      sourceEvents: usefulEvents,
      questions: []
    };
  }

  const questions: QuizQuestion[] = usefulEvents.slice(0, 3).map((event, index) => ({
    id: randomUUID(),
    question: buildQuestion(event.content, index),
    answer: event.content,
    sourceEventIds: [event.id]
  }));

  return {
    id: randomUUID(),
    status: "quiz_ready",
    createdAt,
    reason: "Enough recent, low-sensitivity context exists to generate a small POC quiz.",
    sourceEvents: usefulEvents.slice(0, 5),
    questions
  };
}

function buildQuestion(content: string, index: number) {
  if (content.toLowerCase().includes("notification")) {
    return "How should the POC tell the user that a quiz is ready?";
  }

  if (content.toLowerCase().includes("debug")) {
    return "What should the debug UI show when a quiz cannot be generated?";
  }

  if (content.toLowerCase().includes("electron")) {
    return "Which desktop stack are we using for the first quiz daemon POC?";
  }

  return `What is key personal-context fact #${index + 1} from the latest capture window?`;
}
