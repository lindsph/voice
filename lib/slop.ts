/**
 * Stock “AI slop” tells (Gorrie; The Conversation 2025). Shared list is
 * conventions, not corpus — it does not move learnings between mouths.
 * Per-mouth bans stay on the profile.
 *
 * Density rules are written so seeded golds still pass: the Charise first
 * note has three em dashes; WoolGrown golds say “landscaping”.
 */

export const SHARED_SLOP_WORDS = [
  "delve",
  "tapestry",
  "furthermore",
  "crucial",
  "unlock",
  "leverage",
] as const;

export const SHARED_SLOP_PHRASES = ["in today's world", "in todays world"] as const;

export const SHARED_SLOP_PROMPT = [
  "delve, tapestry, furthermore, crucial, unlock, leverage",
  "in today's world",
  "the landscape of / digital landscape (real landscaping is fine)",
  "stacked “it's not X, it's Y”",
  "stacked “holds this, feeds that, and skips the other”",
];

const LANDSCAPE_SLOP =
  /\b(?:digital|changing|evolving|business|competitive)\s+landscape\b|\bthe landscape of\b/i;

const ANTITHESIS =
  /\bit(?:'s|’s| is) not\b[\s\S]{0,80}?\bit(?:'s|’s| is)\b/gi;

const TRICOLON =
  /\b((?:[A-Za-z']+\s+){1,4}[A-Za-z']+),\s+((?:[A-Za-z']+\s+){1,4}[A-Za-z']+),?\s+and\s+((?:[A-Za-z']+\s+){1,4}[A-Za-z']+)/g;

export type SlopSurface = {
  surfaceId: string;
  maxWords?: number | null;
};

export function isCaptionSurface(surface: SlopSurface): boolean {
  if (
    surface.surfaceId === "social" ||
    surface.surfaceId === "in_person" ||
    surface.surfaceId === "shop_faq"
  ) {
    return true;
  }
  return surface.maxWords != null && surface.maxWords <= 80;
}

export function isNoteSurface(surface: SlopSurface): boolean {
  if (surface.surfaceId === "first_note" || surface.surfaceId === "follow_up") {
    return true;
  }
  return surface.maxWords != null && surface.maxWords <= 120;
}

export function countEmDashes(body: string): number {
  return (body.match(/—|–|--/g) ?? []).length;
}

export function countAntitheses(body: string): number {
  return body.match(ANTITHESIS)?.length ?? 0;
}

export function findTricolons(body: string): string[] {
  return [...body.matchAll(TRICOLON)].map((match) => match[0].trim());
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(body: string, word: string): boolean {
  return new RegExp(`\\b${escapeRe(word)}\\b`, "i").test(body);
}

export function bannedHits(body: string, banned: string[]): string[] {
  const lower = body.toLowerCase();
  return banned.filter((item) => {
    const token = item.split("/")[0]?.trim().toLowerCase() ?? "";
    if (token.length < 3) return false;
    if (token.length < 8) {
      return hasWord(body, token);
    }
    return lower.includes(token);
  });
}

export function slopHits(body: string, surface: SlopSurface): string[] {
  const hits: string[] = [];
  const text = body.trim();
  if (!text) return hits;

  for (const word of SHARED_SLOP_WORDS) {
    if (hasWord(text, word)) hits.push(word);
  }
  for (const phrase of SHARED_SLOP_PHRASES) {
    if (text.toLowerCase().includes(phrase)) hits.push("in today's world");
  }
  if (LANDSCAPE_SLOP.test(text)) hits.push("the landscape of / digital landscape");

  const antitheses = countAntitheses(text);
  const antithesisLimit = isCaptionSurface(surface) || isNoteSurface(surface) ? 1 : 2;
  if (antitheses > antithesisLimit) {
    hits.push(`it's not X, it's Y (${antitheses} times)`);
  }

  const stacks = findTricolons(text);
  const tricolonLimit = isCaptionSurface(surface) ? 0 : 1;
  if (stacks.length > tricolonLimit) {
    hits.push(`rule-of-three stack (${stacks.length})`);
  }

  const dashes = countEmDashes(text);
  if (isCaptionSurface(surface) && dashes >= 2) {
    hits.push(`em-dash density (${dashes} in a short caption)`);
  } else if (isNoteSurface(surface) && dashes >= 4) {
    hits.push(`em-dash density (${dashes} in a short note)`);
  }

  return [...new Set(hits)];
}

export function lintDraft(input: {
  body: string;
  banned: string[];
  surfaceId: string;
  maxWords?: number | null;
}): string[] {
  return [
    ...bannedHits(input.body, input.banned),
    ...slopHits(input.body, { surfaceId: input.surfaceId, maxWords: input.maxWords }),
  ];
}
