/**
 * Crafted drafts: an opt-in style that writes with more life without loosening
 * what the draft may claim. Opus 5.5 takes no temperature, so variety comes
 * from the prompt: a planned angle picked by seed, a craft block that says what
 * is allowed (not only what is banned), and golds rotated by seed.
 *
 * Plain drafts never reach this file, so their prompt stays as it was.
 */

import { hashString } from "./retrieve";

export const DRAFT_STYLES = ["plain", "crafted"] as const;
export type DraftStyle = (typeof DRAFT_STYLES)[number];

/** The angle call sees at most this much of the facts. Blog facts can be long. */
export const ANGLE_FACTS_MAX = 6000;
const ANGLE_MAX = 240;
const ANGLE_COUNT = 3;

export function isCrafted(style: DraftStyle | undefined): boolean {
  return style === "crafted";
}

export function buildAnglePrompt(input: {
  profileName: string;
  surfaceHint?: string;
  facts: string;
}): { system: string; user: string } {
  const system = [
    `You plan the way into one piece of writing in the “${input.profileName}” voice.`,
    'Return one JSON object and nothing else: {"angles":["…","…","…"]}.',
    `Give ${ANGLE_COUNT} angles. Each is one sentence under 30 words, and each is a different way in:`,
    "a specific scene or moment, a question the reader is already asking, a small surprise in the facts,",
    "a season or time of year, or the maker's own view.",
    "Use only the facts given. An angle may not add a result, number, study, or claim.",
  ].join(" ");
  const facts = input.facts.trim();
  const user = [
    ...(input.surfaceHint ? [`What this is: ${input.surfaceHint}`, ""] : []),
    "Facts:",
    facts.length > ANGLE_FACTS_MAX ? `${facts.slice(0, ANGLE_FACTS_MAX)}…` : facts,
  ].join("\n");
  return { system, user };
}

/** The angles from the model's JSON, or none if it sent something else. */
export function parseAngles(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const angles = (parsed as { angles?: unknown } | null)?.angles;
  if (!Array.isArray(angles)) return [];
  return angles
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim().slice(0, ANGLE_MAX))
    .filter(Boolean)
    .slice(0, ANGLE_COUNT);
}

/** Same seed, same angle, so a retry or a rerun with the seed is repeatable. */
export function pickAngle(angles: string[], seed: string): string | undefined {
  if (angles.length === 0) return undefined;
  return angles[hashString(seed) % angles.length];
}

/**
 * The craft notes. A blog post keeps its lead plain and answer-first (readers
 * and search come for the answer); the angle and the scene start the first
 * section instead.
 */
export function craftPromptBlock(angle?: string, options: { blog?: boolean } = {}): string {
  const opening = options.blog
    ? [
        "- The lead stays plain and answer-first: give the answer in its first two sentences, with the concrete step or amount from the facts. No scene in the lead.",
        ...(angle ? [`- Angle: ${angle} Use it to open the first section, then carry it through the sections.`] : []),
        "- Open the first section on something specific (a moment, a place, a season, a thing in someone's hands), not a summary.",
      ]
    : [
        ...(angle ? [`- Angle: ${angle} Build the piece around it.`] : []),
        "- Open on something specific (a moment, a place, a season, a thing in someone's hands), not a summary.",
      ];
  return [
    "Craft (this draft is written with more life):",
    ...opening,
    "- Use concrete, sensory detail from the world this voice lives in, as description only.",
    "- One image or comparison is welcome if it makes the idea clearer. Only one.",
    "- Vary the rhythm: let a short sentence land after a longer one.",
    "- End on something the reader can do or picture, not a slogan.",
    "The line not to cross: facts, numbers, results and claims come only from the facts above. Scene, description, rhythm and word choice are yours, as long as they assert nothing new.",
  ].join("\n");
}
