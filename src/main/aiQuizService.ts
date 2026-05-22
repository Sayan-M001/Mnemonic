import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { ActivitySegment, CaptureEvent, QuizAttempt, QuizQuestion } from "../shared/types.js";
import { requestJsonFromModel } from "./aiClient.js";

type AIQuizPayload = {
  status: "quiz_ready" | "blocked";
  reason: string;
  questions?: Array<{
    question?: string;
    answer: string;
    options: string[];
    sourceSegmentIds: string[];
  }>;
};

const PROMPT_VERSION = "ai-quiz-v2";
const MIN_USEFUL_SEGMENTS = 1;

export async function generateQuizAttemptWithAI(segments: ActivitySegment[], events: CaptureEvent[]): Promise<QuizAttempt> {
  const createdAt = new Date().toISOString();
  const usefulSegments = segments.filter((segment) => segment.confidence >= 0.3 && segment.sourceEventIds.length > 0);
  
  if (usefulSegments.length < MIN_USEFUL_SEGMENTS) {
    return {
      id: randomUUID(),
      status: "blocked",
      createdAt,
      reason: `Need at least ${MIN_USEFUL_SEGMENTS} activity segment before calling AI quiz generation.`,
      sourceEvents: events.filter((e) => e.sensitivity !== "high").slice(0, 5),
      sourceSegments: [],
      questions: [],
      generation: {
        source: "ai",
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
      maxOutputTokens: 4000
    });

    const logPath = path.join(app.getPath("userData"), "debug.log");
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Quiz Model Response Data: ${JSON.stringify(data)}\n`);

    return normalizeQuizPayload(data, usefulSegments, events, model);
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "AI quiz generation failed";
    return {
      id: randomUUID(),
      status: "blocked",
      createdAt,
      reason: `AI generation failed: ${failureReason}`,
      sourceEvents: events.filter((e) => e.sensitivity !== "high").slice(0, 5),
      sourceSegments: usefulSegments.slice(0, 3),
      questions: [],
      generation: {
        source: "ai",
        promptVersion: PROMPT_VERSION,
        failureReason
      }
    };
  }
}

function buildSystemPrompt() {
  return [
    "You generate short multiple-choice memory-recall quizzes (MCQs) from grouped desktop activity segments.",
    "Read the activity segments and produce a quiz_ready result in JSON. Be cooperative and avoid blocking.",
    "Even if the activity is brief or general, you should still generate questions based on the available information.",
    "You can ask about:",
    "- The specific tools, applications, websites, documents, or titles mentioned in the segments.",
    "- The general topics, subjects, frameworks, or concepts the user was exploring.",
    "- Basic conceptual questions related to the subjects observed in the user's activity (e.g., general knowledge questions about the technology or tool they were viewing).",
    "Each question must include: question, a list of 4 distinct multiple-choice 'options', the correct 'answer' (which must be exactly equal to one of the options), and an array of 'sourceSegmentIds' (segment IDs from the input) it depends on.",
    "Do NOT return any event IDs or 'sourceEventIds' in the output. Keep the output extremely compact.",
    "Only return 'blocked' status if there is absolutely no activity context (i.e. input segments list is empty).",
    "Return only valid JSON."
  ].join(" ");
}

function buildUserPrompt(segments: ReturnType<typeof buildQuizContextPayload>) {
  return [
    "Return a JSON object with keys: status, reason, questions.",
    'status must be "quiz_ready" as long as there is at least one segment present.',
    "Even if user activity is brief or general, do not block. Try your best to generate 3 multiple-choice questions.",
    "Each question should include question (the prompt text), options (an array of 4 strings, containing the correct answer), answer (the correct option), and sourceSegmentIds (an array of segment IDs the question is generated from).",
    "Do NOT output sourceEventIds anywhere in the JSON.",
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

  const sourceSegments = extractSourceSegments(payload.questions, usefulSegments, bySegmentId);
  
  // Reconstruct sourceEventIds from selected source segments
  const sourceEventIds = unique(sourceSegments.flatMap((seg) => seg.sourceEventIds));
  const sourceEvents = sourceEventIds.length > 0 
    ? sourceEventIds.map((id) => byEventId.get(id)!).filter(Boolean) 
    : usefulEvents.slice(0, 5);

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
    .filter((question) => question && typeof question.answer === "string")
    .slice(0, 3)
    .map((question) => {
      const prompt = deriveQuestionPrompt(question, usefulSegments);
      const answer = question.answer.trim();
      let options = Array.isArray(question.options)
        ? question.options.map((opt) => String(opt).trim()).filter(Boolean)
        : [];

      if (!options.includes(answer)) {
        options.push(answer);
      }

      options = Array.from(new Set(options));

      while (options.length < 4) {
        options.push(`Alternative choice ${options.length + 1}`);
      }

      // Shuffle options
      options.sort(() => Math.random() - 0.5);

      const segmentIds = Array.isArray(question.sourceSegmentIds)
        ? question.sourceSegmentIds.filter((id): id is string => typeof id === "string" && bySegmentId.has(id))
        : [];

      // Reconstruct sourceEventIds for this question using the segment sourceEventIds
      const derivedEventIds = unique(segmentIds.flatMap((id) => bySegmentId.get(id)?.sourceEventIds ?? []));
      const filteredEventIds = derivedEventIds.filter((id) => byEventId.has(id));

      return {
        id: randomUUID(),
        question: prompt,
        answer,
        options,
        sourceSegmentIds: segmentIds,
        sourceEventIds: filteredEventIds
      };
    })
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
  // Strip sourceEventIds to save input tokens and keep payload small
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
      Array.isArray(question.sourceSegmentIds)
        ? question.sourceSegmentIds.filter((id): id is string => typeof id === "string" && bySegmentId.has(id))
        : []
    )
  );

  return ids.length > 0 ? ids.map((id) => bySegmentId.get(id)!).filter(Boolean) : usefulSegments.slice(0, 3);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function deriveQuestionPrompt(
  question: NonNullable<AIQuizPayload["questions"]>[number],
  usefulSegments: ActivitySegment[]
) {
  if (typeof question.question === "string" && question.question.trim()) {
    return question.question.trim();
  }

  const referencedSegments = Array.isArray(question.sourceSegmentIds)
    ? question.sourceSegmentIds
        .map((id) => usefulSegments.find((segment) => segment.id === id))
        .filter((segment): segment is ActivitySegment => Boolean(segment))
    : [];

  const segment = referencedSegments[0];
  const subject = segment?.subjects[0] ?? segment?.topicHints[0] ?? segment?.title ?? "your recent activity";
  return `Which of the following best matches ${subject}?`;
}
