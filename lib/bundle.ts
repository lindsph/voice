import { retrieveGolds, retrieveLearnings } from "./retrieve";
import { SHARED_SLOP_PROMPT } from "./slop";
import type { Gold, Learning, Surface } from "./types";

export function extractCompactToneRules(toneDoc: string): string {
  const headings = [
    ["## Who this sounds like", "## Voice rules"],
    ["## Who we sound like", "## Voice rules"],
    ["## Voice rules", "### How sentences"],
    ["### How sentences open and flow", "### Warmth"],
    ["### Warmth", "### Claims"],
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
  if (examples.length === 0) return "(No gold examples yet.)";
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

export function formatToneBundle(input: {
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
      Partial<Pick<Learning, "id" | "profileId" | "surface" | "before" | "after" | "why" | "createdAt">>
  >;
}): string {
  const profileId = input.profileId ?? "";
  const query = [input.facts, input.seed].filter(Boolean).join("\n");
  const selected = retrieveGolds(input.golds, {
    profileId,
    surface: input.surfaceId,
    query,
    seed: input.seed,
    architecture: input.architecture,
  });
  const retrieved = retrieveLearnings(
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
    })),
    { profileId, surface: input.surfaceId, query },
  );
  const learnings = formatLearningsForPrompt(retrieved);
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
    formatGoldExamplesForPrompt(selected),
    ...(learnings ? ["", learnings] : []),
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function sectionBetween(doc: string, startHeading: string, endHeading: string): string {
  const start = doc.indexOf(startHeading);
  if (start === -1) return "";
  const from = start + startHeading.length;
  const end = doc.indexOf(endHeading, from);
  return end === -1 ? doc.slice(from) : doc.slice(from, end);
}
