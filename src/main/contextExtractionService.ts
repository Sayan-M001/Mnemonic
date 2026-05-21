import type { StructuredContext } from "../shared/types.js";

type ContextInput = {
  appName?: string;
  windowTitle?: string;
  url?: string;
  tabTitle?: string;
  uiText?: string;
  ocrText?: string;
};

const TITLE_LIKE_PATTERN =
  /^(Explain|Build|Understand|Document|Hide|Review|Prepare|Improve|Expose|Rebuild|Add|Fix|Capture|Compare)\b/;

export function extractStructuredContext(input: ContextInput): StructuredContext {
  const combinedText = [input.windowTitle, input.tabTitle, input.uiText, input.ocrText].filter(Boolean).join("\n");
  const lines = combinedText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const urls = unique(matchUrls(combinedText, input.url));
  const domains = unique(urls.map((url) => safeDomain(url)).filter(Boolean));
  const filePaths = unique(matchFilePaths(combinedText));
  const documents = unique(extractDocuments(lines));
  const titles = unique(extractTitles(lines, input.windowTitle, input.tabTitle));
  const repoNames = unique(extractRepoNames(lines, combinedText));
  const issueIds = unique(extractIssueIds(combinedText));
  const participants = unique(extractParticipants(lines));
  const topicHints = unique(extractTopicHints(combinedText, filePaths, titles));
  const subjects = unique(extractSubjects(combinedText, titles, topicHints));
  const entities = unique([
    ...repoNames,
    ...participants,
    ...titles,
    ...domains,
    ...documents,
    ...issueIds
  ]);
  const evidence = unique([
    input.appName ?? "",
    input.windowTitle ?? "",
    input.tabTitle ?? "",
    input.url ?? "",
    ...titles.slice(0, 2),
    ...filePaths.slice(0, 2)
  ]).filter(Boolean);

  const surfaceType = classifySurfaceType(input, combinedText);
  const activityKind = classifyActivityKind(surfaceType, combinedText, filePaths, titles);
  const summary = buildSummary({
    appName: input.appName,
    surfaceType,
    activityKind,
    entities,
    subjects,
    titles,
    urls,
    filePaths
  });
  const confidence = estimateConfidence({
    appName: input.appName,
    ocrText: input.ocrText,
    surfaceType,
    activityKind,
    entities,
    subjects
  });

  return {
    surfaceType,
    activityKind,
    entities,
    subjects,
    participants,
    evidence,
    artifacts: {
      titles,
      files: filePaths,
      urls,
      domains,
      documents
    },
    resourceRefs: {
      filePaths,
      urls,
      domains,
      repoNames,
      issueIds
    },
    topicHints,
    summary,
    confidence,
    dynamicContext: buildDynamicContext(surfaceType, activityKind, {
      titles,
      documents,
      repoNames,
      issueIds,
      urls,
      domains,
      filePaths,
      participants,
      topicHints
    }),
    interpreter: {
      source: "heuristic",
      promptVersion: "heuristic-v1"
    }
  };
}

function classifySurfaceType(input: ContextInput, text: string): string {
  const appName = (input.appName ?? "").toLowerCase();
  const haystack = `${appName}\n${text}`.toLowerCase();

  if (/(codex|chatgpt|claude|cursor)/.test(haystack)) {
    return "ai_workbench";
  }

  if (/(visual studio code|code|xcode|intellij|pycharm)/.test(haystack)) {
    return "editor";
  }

  if (/(slack|discord|teams|messages|whatsapp|telegram)/.test(haystack)) {
    return "chat";
  }

  if (/(gmail|outlook|mail\.google\.com|mailbox|inbox|compose)/.test(haystack)) {
    return "mail";
  }

  if (/(chrome|arc|safari|brave|firefox|edge)/.test(haystack) || /(https?:\/\/|www\.)/.test(haystack)) {
    return "browser";
  }

  if (/(docs|notion|confluence|word|pages)/.test(haystack)) {
    return "docs";
  }

  if (/(jira|linear|trello|asana|github issues|progress)/.test(haystack)) {
    return "task_board";
  }

  if (/(system settings|settings|preferences)/.test(haystack)) {
    return "settings";
  }

  return "unknown_surface";
}

function classifyActivityKind(
  surfaceType: string,
  text: string,
  filePaths: string[],
  titles: string[]
): string {
  const haystack = `${text}\n${titles.join("\n")}`.toLowerCase();

  if (surfaceType === "chat") {
    return "chatting";
  }

  if (surfaceType === "mail") {
    if (/(compose|reply|draft)/.test(haystack)) {
      return "writing";
    }

    return "reading";
  }

  if (surfaceType === "settings") {
    return "admin";
  }

  if (/(debug|stack trace|error|exception|fix|bug)/.test(haystack)) {
    return "debugging";
  }

  if (/(review|pull request|diff|changes|staged changes|source control)/.test(haystack)) {
    return "reviewing_code";
  }

  if (surfaceType === "editor" || filePaths.length > 0) {
    return "coding";
  }

  if (/(plan|progress|task|todo|next|decision|rule)/.test(haystack)) {
    return "planning";
  }

  if (/(search|docs|pricing|guide|readme|article|compare|browser)/.test(haystack)) {
    return "research";
  }

  if (surfaceType === "docs") {
    return "writing";
  }

  if (/(read|summary|overview)/.test(haystack)) {
    return "reading";
  }

  return "unknown_activity";
}

function buildDynamicContext(
  surfaceType: string,
  activityKind: string,
  data: {
    titles: string[];
    documents: string[];
    repoNames: string[];
    issueIds: string[];
    urls: string[];
    domains: string[];
    filePaths: string[];
    participants: string[];
    topicHints: string[];
  }
) {
  const dynamicContext: Record<string, string | number | boolean | string[] | null> = {
    primaryTitle: data.titles[0] ?? null,
    primaryUrl: data.urls[0] ?? null
  };

  if (surfaceType === "mail") {
    dynamicContext.mailbox = data.titles.find((title) => /inbox|sent|drafts|starred/i.test(title)) ?? null;
    dynamicContext.mailThemes = data.topicHints;
  }

  if (surfaceType === "editor" || activityKind === "coding" || activityKind === "reviewing_code") {
    dynamicContext.repoNames = data.repoNames;
    dynamicContext.activeFiles = data.filePaths;
    dynamicContext.issueIds = data.issueIds;
  }

  if (surfaceType === "chat") {
    dynamicContext.participants = data.participants;
  }

  if (data.documents.length > 0) {
    dynamicContext.documents = data.documents;
  }

  if (data.domains.length > 0) {
    dynamicContext.domains = data.domains;
  }

  return dynamicContext;
}

function extractTitles(lines: string[], windowTitle?: string, tabTitle?: string) {
  const titles = new Set<string>();

  if (windowTitle) {
    titles.add(cleanSentence(windowTitle));
  }

  if (tabTitle) {
    titles.add(cleanSentence(tabTitle));
  }

  for (const line of lines) {
    if (TITLE_LIKE_PATTERN.test(line)) {
      titles.add(cleanSentence(line));
    }
  }

  return Array.from(titles).filter((title) => title.length >= 4 && title.length <= 120);
}

function extractDocuments(lines: string[]) {
  return lines
    .filter((line) => /\.(md|txt|docx?|pdf|xlsx?|csv|ts|tsx|js|jsx|py|swift)$/i.test(line) || /Working Tree/.test(line))
    .map(cleanSentence)
    .slice(0, 8);
}

function extractRepoNames(lines: string[], text: string) {
  const names = new Set<string>();

  for (const line of lines) {
    if (/^[A-Za-z0-9_.-]{2,}$/.test(line) && /(project|workspace|repo|projects)/i.test(text)) {
      names.add(cleanToken(line));
    }

    if (/^[A-Za-z0-9_.-]{2,}\s+\d+[hdw]$/.test(line)) {
      names.add(cleanToken(line.replace(/\s+\d+[hdw]$/, "")));
    }
  }

  return Array.from(names).filter((value) => value.length >= 2 && value.length <= 50);
}

function extractIssueIds(text: string) {
  return text.match(/\b[A-Z]{2,10}-\d+\b/g) ?? [];
}

function extractParticipants(lines: string[]) {
  return lines
    .filter((line) => /(#|channel|dm|direct message|\(Channel\)|\b[A-Z][a-z]+,\s*[A-Z][a-z]+)/.test(line))
    .map(cleanSentence)
    .slice(0, 8);
}

function extractTopicHints(text: string, filePaths: string[], titles: string[]) {
  const hintSet = new Set<string>();
  const haystack = `${text}\n${filePaths.join("\n")}\n${titles.join("\n")}`.toLowerCase();

  for (const keyword of [
    "ocr",
    "capture",
    "context extraction",
    "activity classification",
    "permissions",
    "quiz",
    "daemon",
    "notification",
    "storage",
    "review",
    "github",
    "slack",
    "browser",
    "pricing",
    "debug"
  ]) {
    if (haystack.includes(keyword)) {
      hintSet.add(keyword);
    }
  }

  return Array.from(hintSet);
}

function extractSubjects(text: string, titles: string[], topicHints: string[]) {
  const subjects = new Set<string>();

  for (const title of titles) {
    const cleaned = cleanSentence(title);
    if (cleaned.length >= 4 && cleaned.length <= 80) {
      subjects.add(cleaned);
    }
  }

  for (const hint of topicHints) {
    subjects.add(hint);
  }

  if (/source control|staged changes|commit/i.test(text)) {
    subjects.add("source control");
  }

  return Array.from(subjects).slice(0, 12);
}

function matchUrls(text: string, fallbackUrl?: string) {
  const urls: string[] = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  if (fallbackUrl) {
    urls.push(fallbackUrl);
  }
  return urls;
}

function matchFilePaths(text: string) {
  return text.match(/(?:src|app|pages|scripts|docs|packages)\/[A-Za-z0-9_./-]+/g) ?? [];
}

function safeDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildSummary(input: {
  appName?: string;
  surfaceType: string;
  activityKind: string;
  entities: string[];
  subjects: string[];
  titles: string[];
  urls: string[];
  filePaths: string[];
}) {
  const parts = [
    input.appName ? `App: ${input.appName}` : "",
    `surface ${input.surfaceType}`,
    `activity ${input.activityKind}`,
    input.entities.length ? `entities ${input.entities.slice(0, 4).join(", ")}` : "",
    input.subjects.length ? `subjects ${input.subjects.slice(0, 4).join(", ")}` : "",
    input.filePaths.length ? `files ${input.filePaths.slice(0, 2).join(", ")}` : "",
    input.urls.length ? `urls ${input.urls.slice(0, 1).join(", ")}` : "",
    input.titles.length ? `titles ${input.titles.slice(0, 2).join("; ")}` : ""
  ].filter(Boolean);

  return parts.join(" | ");
}

function estimateConfidence(input: {
  appName?: string;
  ocrText?: string;
  surfaceType: string;
  activityKind: string;
  entities: string[];
  subjects: string[];
}) {
  let score = 0.2;

  if (input.appName) {
    score += 0.15;
  }

  if (input.ocrText && input.ocrText.length > 80) {
    score += 0.2;
  }

  if (input.surfaceType !== "unknown_surface") {
    score += 0.15;
  }

  if (input.activityKind !== "unknown_activity") {
    score += 0.15;
  }

  if (input.entities.length > 0) {
    score += 0.1;
  }

  if (input.subjects.length > 0) {
    score += 0.1;
  }

  return Math.min(1, Math.round(score * 100) / 100);
}

function cleanToken(value: string) {
  return value.replace(/^[•@#]+/, "").trim();
}

function cleanSentence(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[•@#]+/, "").trim();
}
