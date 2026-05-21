import { randomUUID } from "node:crypto";
import type { ActivitySegment, CaptureEvent, QuizAttempt, QuizQuestion } from "../shared/types.js";
import { requestJsonFromModel } from "./aiClient.js";
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
const MIN_USEFUL_SEGMENTS = 1;

export async function generateQuizAttemptWithAI(segments: ActivitySegment[], events: CaptureEvent[]): Promise<QuizAttempt> {
  const usefulSegments = segments.filter((segment) => segment.confidence >= 0.3 && segment.sourceEventIds.length > 0);
  if (usefulSegments.length < MIN_USEFUL_SEGMENTS) {
    const blocked = generateHeuristicQuizAttempt(events);
    return {
      ...blocked,
      sourceSegments: [],
      generation: {
        source: "heuristic",
        promptVersion: PROMPT_VERSION,
        failureReason: `Need at least ${MIN_USEFUL_SEGMENTS} activity segment before calling AI quiz generation.`
      }
    };
  }

  try {
    const quizContext = buildQuizContextPayload(usefulSegments.slice(0, 6));
    const { data, model } = await requestJsonFromModel<AIQuizPayload>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(quizContext),
      maxOutputTokens: 1600
    });

    return normalizeQuizPayload(data, usefulSegments, events, model);
  } catch (error) {
    const fallback = generateHeuristicQuizAttempt(events);
    return {
      ...fallback,
      sourceSegments: usefulSegments.slice(0, 3),
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
    "You generate short memory-recall quizzes from grouped desktop activity segments.",
    "Read the activity segments and produce either a blocked result or a quiz_ready result in JSON.",
    "Questions should test meaningful user context, not pixel trivia.",
    "Only ask about facts that are strongly supported by the provided segments.",
    "Each question must include a concise answer and the sourceSegmentIds it depends on.",
    "Return only valid JSON."
  ].join(" ");
}

function buildUserPrompt(segments: ReturnType<typeof buildQuizContextPayload>) {
  return [
    "Return a JSON object with keys: status, reason, sourceEventIds, questions.",
    'status must be "quiz_ready" or "blocked".',
    "If quiz_ready, return 3 questions.",
    "If blocked, explain why the context is not strong enough yet.",
    "Each question should include sourceSegmentIds and may optionally include sourceEventIds.",
    "Segments:",
    JSON.stringify(segments, null, 2)
  ].join("\n");
}

function normalizeQuizPayload(
  payload: AIQuizPayload,
  usefulSegments: ActivitySegment[],
  usefulEvents: CaptureEvent[],
  model: string
): QuizAttempt {
  const createdAt = new Date().toISOString();
  const byEventId = new Map(usefulEvents.map((event) => [event.id, event]));
  const bySegmentId = new Map(usefulSegments.map((segment) => [segment.id, segment]));
  const sourceEventIds = Array.isArray(payload.sourceEventIds)
    ? payload.sourceEventIds.filter((id): id is string => typeof id === "string" && byEventId.has(id))
    : [];
  const sourceEvents = sourceEventIds.length > 0 ? sourceEventIds.map((id) => byEventId.get(id)!).filter(Boolean) : usefulEvents.slice(0, 5);
  const sourceSegments = extractSourceSegments(payload.questions, usefulSegments, bySegmentId);

  if (payload.status !== "quiz_ready" || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    return {
      id: randomUUID(),
      status: "blocked",
      createdAt,
      reason: typeof payload.reason === "string" && payload.reason.trim() ? payload.reason.trim() : "AI could not produce a grounded quiz yet.",
      sourceEvents,
      sourceSegments,
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
      sourceSegmentIds: Array.isArray((question as { sourceSegmentIds?: unknown }).sourceSegmentIds)
        ? ((question as { sourceSegmentIds?: unknown }).sourceSegmentIds as unknown[])
            .filter((id): id is string => typeof id === "string" && bySegmentId.has(id))
        : [],
      sourceEventIds: Array.isArray(question.sourceEventIds)
        ? question.sourceEventIds.filter((id): id is string => typeof id === "string" && byEventId.has(id))
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
      sourceSegments,
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
      : "AI generated a context-based quiz from recent activity segments.",
    sourceEvents,
    sourceSegments,
    questions,
    generation: {
      source: "ai",
      model,
      promptVersion: PROMPT_VERSION
    }
  };
}

function buildQuizContextPayload(segments: ActivitySegment[]) {
  return segments.map((segment) => ({
    id: segment.id,
    windowStartAt: segment.windowStartAt,
    windowEndAt: segment.windowEndAt,
    title: segment.title,
    surfaceType: segment.surfaceType,
    activityKind: segment.activityKind,
    summary: segment.summary,
    entities: segment.entities,
    subjects: segment.subjects,
    topicHints: segment.topicHints,
    evidence: segment.evidence,
    sourceEventIds: segment.sourceEventIds,
    confidence: segment.confidence
  }));
}

function extractSourceSegments(
  questions: AIQuizPayload["questions"],
  usefulSegments: ActivitySegment[],
  bySegmentId: Map<string, ActivitySegment>
) {
  if (!Array.isArray(questions)) {
    return usefulSegments.slice(0, 3);
  }

  const ids = unique(
    questions.flatMap((question) =>
      Array.isArray((question as { sourceSegmentIds?: unknown }).sourceSegmentIds)
        ? ((question as { sourceSegmentIds?: unknown }).sourceSegmentIds as unknown[])
            .filter((id): id is string => typeof id === "string" && bySegmentId.has(id))
        : []
    )
  );

  return ids.length > 0 ? ids.map((id) => bySegmentId.get(id)!).filter(Boolean) : usefulSegments.slice(0, 3);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
