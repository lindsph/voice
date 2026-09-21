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
  examples: Pick<Gold, "id" | "title" | "body" | "surface" | "canonical">[],
  options: { surface: string; seed: string; count?: number },
): Pick<Gold, "id" | "title" | "body">[] {
  const count = options.count ?? 2;
  if (examples.length === 0) return [];
  if (examples.length <= count) {
    return examples.map(({ id, title, body }) => ({ id, title, body }));
  }

  const preferred = examples.filter(
    (example) =>
      example.surface === options.surface ||
      example.title.toLowerCase().includes(options.surface.replace("_", " ")),
  );
  const rest = examples.filter((example) => !preferred.includes(example));
  const pool = [
    ...preferred.filter((example) => example.canonical),
    ...preferred.filter((example) => !example.canonical),
    ...rest.filter((example) => example.canonical),
    ...rest.filter((example) => !example.canonical),
  ];
  const start = hashString(options.seed) % pool.length;
  const picked: Pick<Gold, "id" | "title" | "body">[] = [];
  for (let index = 0; index < pool.length && picked.length < count; index += 1) {
    const example = pool[(start + index) % pool.length];
    if (!picked.some((item) => item.id === example.id)) {
      picked.push({ id: example.id, title: example.title, body: example.body });
    }
  }
  return picked;
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
  const active = learnings.filter((item) => item.status === "active").slice(-12);
  if (active.length === 0) return "";
  const lines = active.map(
    (item, index) => `${index + 1}. ${item.rule.replace(/\s+/g, " ").trim().slice(0, 160)}`,
  );
  return [
    "Approved tone learnings from edits (follow these; they override golds when they conflict):",
    ...lines,
  ].join("\n");
}

export function formatToneBundle(input: {
  guide: string;
  bannedForPrompt: string[];
  surface: Surface | undefined;
  surfaceId: string;
  seed: string;
  golds: Pick<Gold, "id" | "title" | "body" | "surface" | "canonical">[];
  learnings: Pick<Learning, "rule" | "status">[];
}): string {
  const selected = selectGoldExamples(input.golds, {
    surface: input.surfaceId,
    seed: input.seed,
  });
  const learnings = formatLearningsForPrompt(input.learnings);
  const banned =
    input.bannedForPrompt.length > 0
      ? ["Standing machine rules (always follow):", ...input.bannedForPrompt.map((item) => `- Never: ${item}`)].join(
          "\n",
        )
      : "";
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

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
