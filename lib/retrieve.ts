/**
 * CIPHER retrieval (NeurIPS 2024, Algorithm 1 lines 3–4): only preferences
 * from similar past contexts go into the next generate.
 *
 * Walls:
 * 1. profileId — lindsay and woolgrown never share a pile (SQL + filter).
 * 2. surface — a CNE caption does not see a first-note rule.
 * 3. Token overlap with this draft’s facts/seed — closer learnings rank first.
 *    Golds are different: canonical samples stay. Overlap adds up to three
 *    non-canonical lines, and only ranks when there is no canonical.
 *    A requested architecture keeps that post type plus untyped canonical
 *    seeds. A different architecture stays out. No typed match uses untyped.
 *
 * k=5 was their best CIPHER-5 setting. No same-surface hits → inject nothing
 * (guide still applies). Crossing surfaces is how their Continual LPI raised
 * summarization edit cost vs no learning.
 */

import { ruleForPrompt, tokenJaccard } from "./learn";
import type { Gold, Learning } from "./types";

export const RETRIEVE_LEARNING_K = 5;
export const RETRIEVE_GOLD_K = 2;
/** Published sentences added beside the seed samples. */
export const RETRIEVE_TAUGHT_GOLD_K = 3;

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
  const onSurface = own.flatMap((item) => {
    if (item.surface !== options.surface) return [];
    const rule = ruleForPrompt(item.rule);
    if (!rule) return [];
    return [{ ...item, rule }];
  });
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
  const onSurface = golds.filter((item) => {
    if (item.status && item.status !== "active") return false;
    if (!item.profileId || item.profileId !== options.profileId) return false;
    if (item.surface !== options.surface) return false;
    return true;
  });
  const typed = wantedArch
    ? onSurface.filter((item) => (item.architecture ?? "").trim() === wantedArch)
    : [];
  const untyped = onSurface.filter((item) => !(item.architecture ?? "").trim());
  const seeds = untyped.filter((item) => item.canonical);
  const own = !wantedArch ? onSurface : typed.length > 0 ? [...seeds, ...typed] : untyped;
  if (own.length === 0) return [];

  const query = options.query.trim();
  const anchors = own
    .filter((item) => item.canonical)
    .sort((left, right) => left.id.localeCompare(right.id));
  const rest = rankGoldsByOverlap(
    own.filter((item) => !item.canonical),
    query,
  );

  if (anchors.length > 0) {
    const extra = query
      ? rest.slice(0, RETRIEVE_TAUGHT_GOLD_K)
      : takeRotated(rest, RETRIEVE_TAUGHT_GOLD_K, options.seed);
    return [...anchors, ...extra].map(goldBody);
  }

  const ranked = rankGoldsByOverlap(own, query);
  const picked =
    !query && ranked.length > k ? takeRotated(ranked, k, options.seed) : ranked.slice(0, k);
  return picked.map(goldBody);
}

function goldBody(item: { id: string; title: string; body: string }): {
  id: string;
  title: string;
  body: string;
} {
  return { id: item.id, title: item.title, body: item.body };
}

function rankGoldsByOverlap<T extends { id: string; title: string; body: string; canonical: boolean }>(
  items: T[],
  query: string,
): T[] {
  return [...items].sort((left, right) => {
    const leftScore = query ? tokenJaccard(query, `${left.title}\n${left.body}`) : 0;
    const rightScore = query ? tokenJaccard(query, `${right.title}\n${right.body}`) : 0;
    if (rightScore !== leftScore) return rightScore - leftScore;
    if (Number(right.canonical) !== Number(left.canonical)) {
      return Number(right.canonical) - Number(left.canonical);
    }
    return left.id.localeCompare(right.id);
  });
}

function takeRotated<T extends { id: string }>(ranked: T[], k: number, seed: string): T[] {
  if (ranked.length <= k) return ranked;
  const start = hashString(seed) % ranked.length;
  const picked: T[] = [];
  for (let index = 0; index < ranked.length && picked.length < k; index += 1) {
    const item = ranked[(start + index) % ranked.length]!;
    if (!picked.some((seen) => seen.id === item.id)) picked.push(item);
  }
  return picked;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
