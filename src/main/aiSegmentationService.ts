import { randomUUID } from "node:crypto";
import type { ActivitySegment, CaptureEvent } from "../shared/types.js";
import { requestJsonFromModel } from "./aiClient.js";

type AISegmentPayload = {
  segments?: Array<{
    title: string;
    surfaceType: string;
    activityKind: string;
    summary: string;
    entities?: string[];
    subjects?: string[];
    topicHints?: string[];
    evidence?: string[];
    sourceEventIds: string[];
    confidence?: number;
  }>;
};

const PROMPT_VERSION = "ai-segmentation-v1";

export async function generateSegmentsWithAI(events: CaptureEvent[]): Promise<ActivitySegment[]> {
  const usefulEvents = events
    .filter((event) => event.sensitivity !== "high" && event.content.length > 20)
    .sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime());

  if (usefulEvents.length === 0) {
    return [];
  }

  try {
    const { data, model } = await requestJsonFromModel<AISegmentPayload>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(usefulEvents),
      maxOutputTokens: 2200
    });

    return normalizeSegments(data, usefulEvents, model);
  } catch (error) {
    return buildFallbackSegments(
      usefulEvents,
      error instanceof Error ? error.message : "AI segmentation failed"
    );
  }
}

function buildSystemPrompt() {
  return [
    "You are grouping captured desktop activity into meaningful time segments.",
    "Read the ordered event list and group consecutive related events into a small number of coherent activity segments.",
    "Prefer grouping by sustained task, surface, and topic rather than by single-event noise.",
    "Use open-ended surfaceType and activityKind labels.",
    "Return only valid JSON with a top-level segments array."
  ].join(" ");
}

function buildUserPrompt(events: CaptureEvent[]) {
  const payload = events.map((event) => ({
    id: event.id,
    capturedAt: event.capturedAt,
    source: event.source,
    appName: event.metadata?.appName ?? null,
    windowTitle: event.metadata?.windowTitle ?? null,
    url: event.metadata?.url ?? null,
    ocrText: event.metadata?.ocrText?.slice(0, 1200) ?? null,
    structuredContext: event.metadata?.structuredContext ?? null,
    content: event.content.slice(0, 800)
  }));

  return [
    "Return JSON with a `segments` array.",
    "Each segment must include: title, surfaceType, activityKind, summary, sourceEventIds.",
    "Optional keys: entities, subjects, topicHints, evidence, confidence.",
    "Only use sourceEventIds from the provided events.",
    "Events:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

function normalizeSegments(payload: AISegmentPayload, events: CaptureEvent[], model: string): ActivitySegment[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];

  const segments = rawSegments
    .map((segment) => {
      const sourceEventIds = Array.isArray(segment.sourceEventIds)
        ? unique(segment.sourceEventIds.filter((id): id is string => typeof id === "string" && byId.has(id)))
        : [];

      if (sourceEventIds.length === 0) {
        return null;
      }

      const sourceEvents = sourceEventIds.map((id) => byId.get(id)!).sort(sortByCapturedAt);
      return buildSegment({
        title: typeof segment.title === "string" && segment.title.trim() ? segment.title.trim() : sourceEvents[0].metadata?.windowTitle ?? "Captured activity",
        surfaceType: normalizeLabel(segment.surfaceType, sourceEvents[0].metadata?.structuredContext?.surfaceType ?? "captured_activity"),
        activityKind: normalizeLabel(segment.activityKind, sourceEvents[0].metadata?.structuredContext?.activityKind ?? "working"),
        summary: typeof segment.summary === "string" && segment.summary.trim()
          ? segment.summary.trim()
          : buildDefaultSummary(sourceEvents),
        entities: normalizeStringArray(segment.entities),
        subjects: normalizeStringArray(segment.subjects),
        topicHints: normalizeStringArray(segment.topicHints),
        evidence: normalizeStringArray(segment.evidence),
        confidence: normalizeConfidence(segment.confidence, sourceEvents),
        sourceEventIds,
        generation: {
          source: "ai",
          model,
          promptVersion: PROMPT_VERSION
        }
      }, sourceEvents);
    })
    .filter((segment): segment is ActivitySegment => Boolean(segment));

  return segments.length > 0 ? segments : buildFallbackSegments(events, "AI returned no valid segments.");
}

function buildFallbackSegments(events: CaptureEvent[], failureReason: string): ActivitySegment[] {
  const sorted = [...events].sort(sortByCapturedAt);
  const groups = new Map<string, CaptureEvent[]>();

  for (const event of sorted) {
    const key = [
      event.metadata?.appName ?? "unknown_app",
      event.metadata?.structuredContext?.surfaceType ?? "captured_activity",
      event.metadata?.structuredContext?.activityKind ?? "working"
    ].join("::");
    const bucket = groups.get(key) ?? [];
    bucket.push(event);
    groups.set(key, bucket);
  }

  return Array.from(groups.values()).map((group) => {
    const first = group[0];
    const context = first.metadata?.structuredContext;
    return buildSegment({
      title: first.metadata?.windowTitle ?? first.metadata?.appName ?? "Captured activity",
      surfaceType: context?.surfaceType ?? "captured_activity",
      activityKind: context?.activityKind ?? "working",
      summary: buildDefaultSummary(group),
      entities: context?.entities ?? [],
      subjects: context?.subjects ?? [],
      topicHints: context?.topicHints ?? [],
      evidence: context?.evidence ?? [],
      confidence: context?.confidence ?? 0.45,
      sourceEventIds: group.map((event) => event.id),
      generation: {
        source: "heuristic",
        promptVersion: PROMPT_VERSION,
        failureReason
      }
    }, group);
  });
}

function buildSegment(
  segment: {
    title: string;
    surfaceType: string;
    activityKind: string;
    summary: string;
    entities: string[];
    subjects: string[];
    topicHints: string[];
    evidence: string[];
    confidence: number;
    sourceEventIds: string[];
    generation: ActivitySegment["generation"];
  },
  sourceEvents: CaptureEvent[]
): ActivitySegment {
  const sorted = [...sourceEvents].sort(sortByCapturedAt);
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    windowStartAt: sorted[0].capturedAt,
    windowEndAt: sorted[sorted.length - 1].capturedAt,
    title: segment.title,
    surfaceType: segment.surfaceType,
    activityKind: segment.activityKind,
    summary: segment.summary,
    entities: unique(segment.entities).slice(0, 12),
    subjects: unique(segment.subjects).slice(0, 12),
    topicHints: unique(segment.topicHints).slice(0, 12),
    evidence: unique(segment.evidence).slice(0, 8),
    sourceEventIds: segment.sourceEventIds,
    confidence: Math.max(0, Math.min(1, segment.confidence)),
    generation: segment.generation
  };
}

function buildDefaultSummary(events: CaptureEvent[]) {
  const appNames = unique(events.map((event) => event.metadata?.appName).filter((value): value is string => Boolean(value)));
  const topics = unique(
    events.flatMap((event) => event.metadata?.structuredContext?.topicHints ?? [])
  );
  const surface = events[0]?.metadata?.structuredContext?.surfaceType ?? "captured_activity";
  return [
    appNames.length > 0 ? `User worked in ${appNames.join(", ")}` : "User worked across captured activity",
    `on ${surface}`,
    topics.length > 0 ? `with topics like ${topics.slice(0, 3).join(", ")}` : ""
  ].filter(Boolean).join(" ");
}

function sortByCapturedAt(left: CaptureEvent, right: CaptureEvent) {
  return new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime();
}

function normalizeLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().replace(/\s+/g, "_").toLowerCase();
  return normalized || fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function normalizeConfidence(value: unknown, events: CaptureEvent[]) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return Math.max(0, Math.min(1, value));
  }

  const interpreted = events
    .map((event) => event.metadata?.structuredContext?.confidence)
    .filter((confidence): confidence is number => typeof confidence === "number");

  if (interpreted.length === 0) {
    return 0.5;
  }

  return interpreted.reduce((sum, confidence) => sum + confidence, 0) / interpreted.length;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
