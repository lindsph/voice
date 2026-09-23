/**
 * CIPHER retrieval (NeurIPS 2024, Algorithm 1 lines 3–4): only preferences
 * from similar past contexts go into the next generate.
 *
 * Walls:
 * 1. profileId — lindsay and woolgrown never share a pile (SQL + filter).
 * 2. surface — a CNE caption does not see a first-note rule.
 * 3. Token overlap with this draft’s facts/seed — closer evidence ranks first.
 *
 * k=5 was their best CIPHER-5 setting. No same-surface hits → inject nothing
 * (guide still applies). Crossing surfaces is how their Continual LPI raised
 * summarization edit cost vs no learning.
 */

import { isQuotedSnippetRule, tokenJaccard } from "./learn";
import type { Gold, Learning } from "./types";

export const RETRIEVE_LEARNING_K = 5;
export const RETRIEVE_GOLD_K = 2;

export function learningEvidence(item: {
  rule: string;
  before?: string;
  after?: string;
  why?: string;
}): string {
  return [item.before, item.after, item.why, item.rule].filter(Boolean).join("\n");
}

export function retrieveLearnings(
  learnings: Array<
    Pick<Learning, "id" | "profileId" | "rule" | "status" | "surface"> &
      Partial<Pick<Learning, "before" | "after" | "why" | "createdAt">>
  >,
  options: {
    profileId: string;
    surface: string;
    query: string;
    k?: number;
  },
): typeof learnings {
  const k = options.k ?? RETRIEVE_LEARNING_K;
  const own = learnings.filter(
    (item) => item.profileId === options.profileId && item.status === "active",
  );
  const onSurface = own.filter(
    (item) => item.surface === options.surface && !isQuotedSnippetRule(item.rule),
  );
  if (onSurface.length === 0) return [];

  const query = options.query.trim();
  const ranked = [...onSurface].sort((left, right) => {
    const leftScore = query ? tokenJaccard(query, learningEvidence(left)) : 0;
    const rightScore = query ? tokenJaccard(query, learningEvidence(right)) : 0;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
  });
  return ranked.slice(0, k);
}

export function retrieveGolds(
  golds: Array<
    Pick<Gold, "id" | "title" | "body" | "surface" | "canonical"> &
      Partial<Pick<Gold, "profileId" | "status" | "architecture">>
  >,
  options: {
    profileId: string;
    surface: string;
    query: string;
    seed: string;
    k?: number;
    architecture?: string;
  },
): Pick<Gold, "id" | "title" | "body">[] {
  const k = options.k ?? RETRIEVE_GOLD_K;
  const wantedArch = options.architecture?.trim() ?? "";
  const own = golds.filter((item) => {
    if (item.status && item.status !== "active") return false;
    if (!item.profileId || item.profileId !== options.profileId) return false;
    if (item.surface !== options.surface) return false;
    if (wantedArch && (item.architecture ?? "").trim() !== wantedArch) {
      return false;
    }
    return true;
  });
  if (own.length === 0) return [];

  const query = options.query.trim();
  const ranked = [...own].sort((left, right) => {
    const leftScore = query ? tokenJaccard(query, `${left.title}\n${left.body}`) : 0;
    const rightScore = query ? tokenJaccard(query, `${right.title}\n${right.body}`) : 0;
    if (rightScore !== leftScore) return rightScore - leftScore;
    if (Number(right.canonical) !== Number(left.canonical)) {
      return Number(right.canonical) - Number(left.canonical);
    }
    return left.id.localeCompare(right.id);
  });

  if (!query && ranked.length > k) {
    const start = hashString(options.seed) % ranked.length;
    const picked: typeof ranked = [];
    for (let index = 0; index < ranked.length && picked.length < k; index += 1) {
      const item = ranked[(start + index) % ranked.length]!;
      if (!picked.some((seen) => seen.id === item.id)) picked.push(item);
    }
    return picked.map(({ id, title, body }) => ({ id, title, body }));
  }

  return ranked.slice(0, k).map(({ id, title, body }) => ({ id, title, body }));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
