import { randomUUID } from "node:crypto";
import type { CaptureEvent, QuizAttempt, QuizQuestion } from "../shared/types.js";
import { requestJsonFromModel } from "./aiClient.js";
import { buildQuizContextPayload } from "./aiInterpretationService.js";
import { generateQuizAttempt as generateHeuristicQuizAttempt } from "./quizGenerator.js";

type AIQuizPayload = {
  status: "quiz_ready" | "blocked";
  reason: string;
  sourceEventIds?: string[];
  questions?: Array<{
    question: string;
    answer: string;
    sourceEventIds: string[];
  }>;
};

const PROMPT_VERSION = "ai-quiz-v1";
const MIN_USEFUL_EVENTS = 3;

export async function generateQuizAttemptWithAI(events: CaptureEvent[]): Promise<QuizAttempt> {
  const usefulEvents = events.filter((event) => event.sensitivity !== "high" && event.content.length > 40);
  if (usefulEvents.length < MIN_USEFUL_EVENTS) {
    const blocked = generateHeuristicQuizAttempt(events);
    return {
      ...blocked,
      generation: {
        source: "heuristic",
        promptVersion: PROMPT_VERSION,
        failureReason: `Need at least ${MIN_USEFUL_EVENTS} useful events before calling AI quiz generation.`
      }
    };
  }

  try {
    const quizContext = buildQuizContextPayload(usefulEvents.slice(0, 8));
    const { data, model } = await requestJsonFromModel<AIQuizPayload>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(quizContext),
      maxOutputTokens: 1600
    });

    return normalizeQuizPayload(data, usefulEvents, model);
  } catch (error) {
    const fallback = generateHeuristicQuizAttempt(events);
    return {
      ...fallback,
      generation: {
        source: "heuristic",
        promptVersion: PROMPT_VERSION,
        failureReason: error instanceof Error ? error.message : "AI quiz generation failed"
      }
    };
  }
}

function buildSystemPrompt() {
  return [
    "You generate short memory-recall quizzes from desktop activity context.",
    "Read the event list and produce either a blocked result or a quiz_ready result in JSON.",
    "Questions should test meaningful user context, not pixel trivia.",
    "Only ask about facts that are strongly supported by the event payload.",
    "Each question must include a concise answer and the sourceEventIds it depends on.",
    "Return only valid JSON."
  ].join(" ");
}

function buildUserPrompt(events: ReturnType<typeof buildQuizContextPayload>) {
  return [
    "Return a JSON object with keys: status, reason, sourceEventIds, questions.",
    'status must be "quiz_ready" or "blocked".',
    "If quiz_ready, return 3 questions.",
    "If blocked, explain why the context is not strong enough yet.",
    "Events:",
    JSON.stringify(events, null, 2)
  ].join("\n");
}

function normalizeQuizPayload(payload: AIQuizPayload, usefulEvents: CaptureEvent[], model: string): QuizAttempt {
  const createdAt = new Date().toISOString();
  const byId = new Map(usefulEvents.map((event) => [event.id, event]));
  const sourceEventIds = Array.isArray(payload.sourceEventIds)
    ? payload.sourceEventIds.filter((id): id is string => typeof id === "string" && byId.has(id))
    : [];
  const sourceEvents = sourceEventIds.length > 0 ? sourceEventIds.map((id) => byId.get(id)!).filter(Boolean) : usefulEvents.slice(0, 5);

  if (payload.status !== "quiz_ready" || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    return {
      id: randomUUID(),
      status: "blocked",
      createdAt,
      reason: typeof payload.reason === "string" && payload.reason.trim() ? payload.reason.trim() : "AI could not produce a grounded quiz yet.",
      sourceEvents,
      questions: [],
      generation: {
        source: "ai",
        model,
        promptVersion: PROMPT_VERSION
      }
    };
  }

  const questions: QuizQuestion[] = payload.questions
    .filter((question) => question && typeof question.question === "string" && typeof question.answer === "string")
    .slice(0, 3)
    .map((question) => ({
      id: randomUUID(),
      question: question.question.trim(),
      answer: question.answer.trim(),
      sourceEventIds: Array.isArray(question.sourceEventIds)
        ? question.sourceEventIds.filter((id): id is string => typeof id === "string" && byId.has(id))
        : []
    }))
    .filter((question) => question.question && question.answer);

  if (questions.length === 0) {
    return {
      id: randomUUID(),
      status: "blocked",
      createdAt,
      reason: "AI returned no valid questions.",
      sourceEvents,
      questions: [],
      generation: {
        source: "ai",
        model,
        promptVersion: PROMPT_VERSION,
        failureReason: "No valid questions in model output"
      }
    };
  }

  return {
    id: randomUUID(),
    status: "quiz_ready",
    createdAt,
    reason: typeof payload.reason === "string" && payload.reason.trim()
      ? payload.reason.trim()
      : "AI generated a context-based quiz from recent captured activity.",
    sourceEvents,
    questions,
    generation: {
      source: "ai",
      model,
      promptVersion: PROMPT_VERSION
    }
  };
}
