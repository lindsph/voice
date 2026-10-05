import { isClassificationSource, isLearningKind } from "./learning-kind";
import { retrieveGolds, retrieveLearnings } from "./retrieve";
import { bannedPhrasesChecked, SHARED_SLOP_PROMPT } from "./slop";
import type { Gold, Learning, Surface } from "./types";

export function extractCompactToneRules(toneDoc: string): string {
  const headings = [
    ["## Who this sounds like", "## Voice rules"],
    ["## Who we sound like", "## Voice rules"],
    ["## Voice rules", "### How sentences"],
    ["### How sentences open and flow", "### Warmth"],
    ["### Warmth", ["### Claims", "## Banned / flagged phrases"]],
    ["### Claims", "## Gold examples"],
    ["## Banned / flagged phrases", "## Publish"],
    ["## Claims posture (summary)", "## Example paragraphs"],
  ] as const;

  const parts = headings
    .map(([start, end]) => {
      const body = sectionBetween(toneDoc, start, end).trim();
      return body ? `${start}\n\n${body}` : "";
    })
    .filter(Boolean);

  if (parts.length === 0) {
    return toneDoc.slice(0, 2400);
  }
  return parts.join("\n\n");
}

export function selectGoldExamples(
  examples: Array<
    Pick<Gold, "id" | "title" | "body" | "surface" | "canonical"> &
      Partial<Pick<Gold, "profileId" | "status">>
  >,
  options: {
    surface: string;
    seed: string;
    count?: number;
    profileId?: string;
    query?: string;
    architecture?: string;
  },
): Pick<Gold, "id" | "title" | "body">[] {
  return retrieveGolds(examples, {
    profileId: options.profileId ?? "",
    surface: options.surface,
    query: options.query ?? "",
    seed: options.seed,
    k: options.count,
    architecture: options.architecture,
  });
}

export function formatGoldExamplesForPrompt(examples: Pick<Gold, "title" | "body">[]): string {
  if (examples.length === 0) return "";
  const blocks = examples.map(
    (example) =>
      `### ${example.title}\n\n${example.body.trim()}\n\n(Use as voice reference — vary openings; do not paraphrase wholesale.)`,
  );
  return ["Gold examples (voice reference only — vary; do not clone):", ...blocks].join("\n\n");
}

export function formatLearningsForPrompt(learnings: Pick<Learning, "rule" | "status">[]): string {
  const active = learnings.filter((item) => item.status === "active");
  if (active.length === 0) return "";
  const lines = active.map(
    (item, index) => `${index + 1}. ${item.rule.replace(/\s+/g, " ").trim().slice(0, 160)}`,
  );
  return [
    "Standing preferences from edits (follow these; they override golds when they conflict):",
    ...lines,
  ].join("\n");
}

export type ToneBundleInput = {
  guide: string;
  bannedForPrompt: string[];
  surface: Surface | undefined;
  surfaceId: string;
  seed: string;
  facts?: string;
  profileId?: string;
  golds: Array<
    Pick<Gold, "id" | "title" | "body" | "surface" | "canonical"> &
      Partial<Pick<Gold, "profileId" | "status" | "rejected" | "architecture">>
  >;
  architecture?: string;
  learnings: Array<
    Pick<Learning, "rule" | "status"> &
      Partial<
        Pick<
          Learning,
          | "id"
          | "profileId"
          | "surface"
          | "before"
          | "after"
          | "why"
          | "createdAt"
          | "kind"
          | "classificationSource"
          | "classificationMismatch"
        >
      >
  >;
};

export type SelectedGold = Pick<Gold, "id" | "title" | "body"> & { reason: string };

export type SelectedLearning = Pick<Learning, "id" | "rule" | "status"> & {
  reason: string;
  kind?: Learning["kind"];
  classificationSource?: Learning["classificationSource"];
  classificationMismatch?: boolean;
};

export type ToneSelection = {
  golds: SelectedGold[];
  learnings: SelectedLearning[];
  bannedPhrasesChecked: string[];
};

export function collectToneSelection(input: ToneBundleInput): ToneSelection {
  const profileId = input.profileId ?? "";
  const query = [input.facts, input.seed].filter(Boolean).join("\n");
  const architecture = input.architecture?.trim() ?? "";
  const onSurface = input.golds.filter((item) => {
    if (item.status && item.status !== "active") return false;
    if (!item.profileId || item.profileId !== profileId) return false;
    return item.surface === input.surfaceId;
  });
  const typed = architecture
    ? onSurface.filter((item) => (item.architecture ?? "").trim() === architecture)
    : [];
  const untypedFallback = Boolean(architecture) && typed.length === 0;
  const byId = new Map(input.golds.map((item) => [item.id, item]));
  const golds = retrieveGolds(input.golds, {
    profileId,
    surface: input.surfaceId,
    query,
    seed: input.seed,
    architecture: input.architecture,
  }).map((item) => ({
    ...item,
    reason: goldReason(byId.get(item.id), { query, architecture, untypedFallback }),
  }));
  const learnings = retrieveLearnings(
    input.learnings.map((item, index) => ({
      id: item.id ?? `learning-${index}`,
      profileId: item.profileId ?? "",
      rule: item.rule,
      status: item.status,
      surface: item.surface ?? "",
      before: item.before,
      after: item.after,
      why: item.why,
      createdAt: item.createdAt,
      kind: "kind" in item ? item.kind : undefined,
      classificationSource: "classificationSource" in item ? item.classificationSource : undefined,
      classificationMismatch:
        "classificationMismatch" in item ? item.classificationMismatch : undefined,
    })),
    { profileId, surface: input.surfaceId, query },
  ).map((item) => ({
    id: item.id,
    rule: item.rule,
    status: item.status,
    reason: query.trim() ? "Same surface, closest to these facts." : "Same surface.",
    ...(isLearningKind(item.kind) ? { kind: item.kind } : {}),
    ...(isClassificationSource(item.classificationSource)
      ? { classificationSource: item.classificationSource }
      : {}),
    ...(typeof item.classificationMismatch === "boolean"
      ? { classificationMismatch: item.classificationMismatch }
      : {}),
  }));
  return {
    golds,
    learnings,
    bannedPhrasesChecked: bannedPhrasesChecked(input.bannedForPrompt),
  };
}

function goldReason(
  gold:
    | (Partial<Pick<Gold, "canonical" | "architecture">> & { canonical?: boolean })
    | undefined,
  options: { query: string; architecture: string; untypedFallback: boolean },
): string {
  if (gold?.canonical) return "Gold example for this surface.";
  const matchesType = Boolean(options.architecture) && (gold?.architecture ?? "").trim() === options.architecture;
  if (options.untypedFallback) {
    return "No example for this post type, so this untyped one was used.";
  }
  if (matchesType && options.query.trim()) {
    return "Taught example for this post type, closest to these facts.";
  }
  if (matchesType) return "Taught example for this post type.";
  if (options.query.trim()) return "Taught example, closest to these facts.";
  return "Taught example rotated in for this seed.";
}

export function formatToneBundle(input: ToneBundleInput): string {
  const selected = collectToneSelection(input);
  const learnings = formatLearningsForPrompt(selected.learnings);
  const mouthBanned =
    input.bannedForPrompt.length > 0
      ? input.bannedForPrompt.map((item) => `- Never: ${item}`)
      : [];
  const banned = [
    "Standing machine rules (always follow):",
    ...SHARED_SLOP_PROMPT.map((item) => `- Never: ${item}`),
    ...mouthBanned,
  ].join("\n");
  const purpose = input.surface
    ? `Surface: ${input.surface.label} — ${input.surface.hint}${
        input.surface.maxWords ? ` Stay under ${input.surface.maxWords} words.` : ""
      }`
    : `Surface: ${input.surfaceId}`;

  return [
    "Tone rules (always follow):",
    extractCompactToneRules(input.guide),
    "",
    banned,
    "",
    purpose,
    "",
    formatGoldExamplesForPrompt(selected.golds),
    ...(learnings ? ["", learnings] : []),
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function sectionBetween(
  doc: string,
  startHeading: string,
  endHeading: string | readonly string[],
): string {
  const start = doc.indexOf(startHeading);
  if (start === -1) return "";
  const from = start + startHeading.length;
  const ends = typeof endHeading === "string" ? [endHeading] : endHeading;
  let end = -1;
  for (const heading of ends) {
    const at = doc.indexOf(heading, from);
    if (at !== -1 && (end === -1 || at < end)) end = at;
  }
  // A missing end heading is not "the rest of the file".
  if (end === -1) return "";
  return doc.slice(from, end);
}
