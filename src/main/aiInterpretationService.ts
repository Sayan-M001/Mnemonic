import type { CaptureEvent, StructuredContext } from "../shared/types.js";
import { requestJsonFromModel } from "./aiClient.js";
import { extractStructuredContext } from "./contextExtractionService.js";

type InterpretationInput = {
  appName?: string;
  windowTitle?: string;
  url?: string;
  tabTitle?: string;
  uiText?: string;
  ocrText?: string;
};

type AIContextPayload = Omit<StructuredContext, "interpreter"> & {
  interpreter?: StructuredContext["interpreter"];
};

const PROMPT_VERSION = "ai-context-v1";

export async function interpretStructuredContext(input: InterpretationInput): Promise<StructuredContext> {
  const fallback = extractStructuredContext(input);
  const appName = input.appName?.trim();
  const windowTitle = input.windowTitle?.trim();
  const url = input.url?.trim();
  const tabTitle = input.tabTitle?.trim();
  const uiText = input.uiText?.trim();
  const ocrText = input.ocrText?.trim();

  if (!appName && !windowTitle && !url && !tabTitle && !uiText && !ocrText) {
    return fallback;
  }

  try {
    const { data, model } = await requestJsonFromModel<AIContextPayload>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt({ appName, windowTitle, url, tabTitle, uiText, ocrText, fallback }),
      maxOutputTokens: 1800
    });

    return normalizeStructuredContext({
      ...data,
      interpreter: {
        source: "ai",
        model,
        promptVersion: PROMPT_VERSION
      }
    }, fallback);
  } catch (error) {
    return {
      ...fallback,
      interpreter: {
        source: "heuristic",
        promptVersion: PROMPT_VERSION,
        failureReason: error instanceof Error ? error.message : "AI interpretation failed"
      }
    };
  }
}

function buildSystemPrompt() {
  return [
    "You are an activity understanding model for a local desktop memory app.",
    "Read OCR text and app metadata, then return a JSON object that summarizes the user's likely activity.",
    "Be conservative and grounded. Prefer obvious signals like app name, URL, tab title, and window title over noisy OCR body text.",
    "Do not invent facts. If uncertain, lower confidence and keep categories broad.",
    "Return only valid JSON.",
    "surfaceType and activityKind are open-ended strings. Choose the most natural, specific labels that fit the evidence.",
    "Examples of acceptable surfaceType values include gmail_inbox, slack_dm, vscode_editor, codex_workspace, figma_canvas, browser_checkout_page, terminal_build_log, or unknown_surface.",
    "Examples of acceptable activityKind values include triaging_incoming_messages, reading, coding, reviewing_changes, debugging_build_failure, planning_work, researching_docs, or unknown_activity.",
    "dynamicContext should stay shallow: keys mapped to strings, numbers, booleans, arrays of strings, or null."
  ].join(" ");
}

function buildUserPrompt({
  appName,
  windowTitle,
  url,
  tabTitle,
  uiText,
  ocrText,
  fallback
}: InterpretationInput & { fallback: StructuredContext }) {
  const payload = {
    appName: appName ?? null,
    windowTitle: windowTitle ?? null,
    url: url ?? null,
    tabTitle: tabTitle ?? null,
    uiText: uiText ?? null,
    ocrText: ocrText ?? null,
    heuristicFallback: fallback
  };

  return [
    "Interpret this captured desktop event and produce a JSON object with these keys:",
    "surfaceType, activityKind, entities, subjects, participants, evidence, artifacts, resourceRefs, topicHints, summary, confidence, dynamicContext.",
    "confidence must be between 0 and 1.",
    "evidence should include only the strongest concrete signals.",
    "Prefer specific labels over generic ones when the evidence supports them.",
    "Prefer mail-specific interpretation when the URL or title clearly points to Gmail or another mail surface.",
    "Event payload:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

function normalizeStructuredContext(candidate: AIContextPayload, fallback: StructuredContext): StructuredContext {
  const safe = candidate ?? {};
  return {
    surfaceType: normalizeLabel(safe.surfaceType, fallback.surfaceType),
    activityKind: normalizeLabel(safe.activityKind, fallback.activityKind),
    entities: normalizeStringArray(safe.entities, fallback.entities),
    subjects: normalizeStringArray(safe.subjects, fallback.subjects),
    participants: normalizeStringArray(safe.participants, fallback.participants),
    evidence: normalizeStringArray(safe.evidence, fallback.evidence),
    artifacts: {
      titles: normalizeStringArray(safe.artifacts && (safe.artifacts as Record<string, unknown>).titles, fallback.artifacts.titles),
      files: normalizeStringArray(safe.artifacts && (safe.artifacts as Record<string, unknown>).files, fallback.artifacts.files),
      urls: normalizeStringArray(safe.artifacts && (safe.artifacts as Record<string, unknown>).urls, fallback.artifacts.urls),
      domains: normalizeStringArray(safe.artifacts && (safe.artifacts as Record<string, unknown>).domains, fallback.artifacts.domains),
      documents: normalizeStringArray(safe.artifacts && (safe.artifacts as Record<string, unknown>).documents, fallback.artifacts.documents)
    },
    resourceRefs: {
      filePaths: normalizeStringArray(safe.resourceRefs && (safe.resourceRefs as Record<string, unknown>).filePaths, fallback.resourceRefs.filePaths),
      urls: normalizeStringArray(safe.resourceRefs && (safe.resourceRefs as Record<string, unknown>).urls, fallback.resourceRefs.urls),
      domains: normalizeStringArray(safe.resourceRefs && (safe.resourceRefs as Record<string, unknown>).domains, fallback.resourceRefs.domains),
      repoNames: normalizeStringArray(safe.resourceRefs && (safe.resourceRefs as Record<string, unknown>).repoNames, fallback.resourceRefs.repoNames),
      issueIds: normalizeStringArray(safe.resourceRefs && (safe.resourceRefs as Record<string, unknown>).issueIds, fallback.resourceRefs.issueIds)
    },
    topicHints: normalizeStringArray(safe.topicHints, fallback.topicHints),
    summary: typeof safe.summary === "string" && safe.summary.trim() ? safe.summary.trim() : fallback.summary,
    confidence: normalizeConfidence(safe.confidence, fallback.confidence),
    dynamicContext: normalizeDynamicContext(safe.dynamicContext, fallback.dynamicContext),
    interpreter: safe.interpreter ?? fallback.interpreter
  };
}

function normalizeLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().replace(/\s+/g, "_").toLowerCase();
  return normalized || fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return unique(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  ).slice(0, 12);
}

function normalizeConfidence(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeDynamicContext(
  value: unknown,
  fallback: StructuredContext["dynamicContext"]
): StructuredContext["dynamicContext"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const normalized: StructuredContext["dynamicContext"] = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) {
      continue;
    }

    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" || raw === null) {
      normalized[key] = raw;
      continue;
    }

    if (Array.isArray(raw)) {
      normalized[key] = raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : fallback;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function buildQuizContextPayload(events: CaptureEvent[]) {
  return events.map((event) => ({
    id: event.id,
    capturedAt: event.capturedAt,
    source: event.source,
    sensitivity: event.sensitivity,
    content: event.content.slice(0, 1400),
    appName: event.metadata?.appName ?? null,
    windowTitle: event.metadata?.windowTitle ?? null,
    url: event.metadata?.url ?? null,
    structuredContext: event.metadata?.structuredContext ?? null
  }));
}
