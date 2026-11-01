/**
 * Voice eval scoring. Pure: no database, no model calls.
 *
 * Three scores per case (one exam question = a brief + what the person published):
 * - passed: a blind judge, shown her real piece and the draft in both orders,
 *   could not pick hers both times.
 * - keptPercent: share of the draft's words that are in what she published.
 * - tells: how many of the profile's own rules the draft breaks.
 */

import { parseBlogJson } from "./blog-shape";
import { countAntitheses, countEmDashes, findTricolons } from "./slop";

/** Both texts are cut to the same length so length never gives the draft away. */
export const EVAL_MAX_WORDS = 380;
/** A run is due after this many new cases… */
export const EVAL_NEW_CASES_DUE = 3;
/** …or this long after the last run, so learned rules drifting is caught too. */
export const EVAL_MONTHLY_MS = 30 * 24 * 60 * 60 * 1000;
/** A run still "running" after this long is treated as dead. */
export const EVAL_STALE_RUN_MS = 2 * 60 * 60 * 1000;
/** Drafts written per case in a run, so one lucky or unlucky draft doesn't move the score. */
export const EVAL_DRAFTS_PER_CASE = 3;
/** Characters of each draft kept on the run, for head-to-head comparisons later. */
export const EVAL_DRAFT_KEEP_CHARS = 4000;

/** One draft of one case. */
export type EvalDraftScore = {
  passed: boolean;
  /** 0, 1 or 2: how many orders the judge picked her real piece. */
  judgeCorrect: number;
  /** 1–10: how much the draft sounds like the writer of her real piece. */
  likeHer: number;
  keptPercent: number;
  tells: number;
  /** Em-dashes, "it's not X, it's Y" and lists of three, per 1,000 words. */
  countedPer1k: number;
  judgeWhy: string[];
  tellsBroken: string[];
  /** Saved for head-to-head against a later candidate run. */
  draft: string;
};

export type EvalCaseScore = {
  sourceId: string;
  drafts: EvalDraftScore[];
  /** The same counted tells in her real piece, for comparison. */
  herCountedPer1k: number;
  /** Candidate runs: this case against the baseline run's drafts. */
  headToHead?: HeadToHead;
  error?: string;
};

export type HeadToHead = { wins: number; ties: number; losses: number };

/** What the person did with real (not test) drafts: from Voice's own log, cases that have one. */
export type RealResults = { cases: number; keptPercent: number; medianDaysToLive: number | null };

export type EvalScores = {
  /** Drafts that passed as hers, out of `drafts`. */
  passes: number;
  /** Cases scored. */
  cases: number;
  drafts?: number;
  likeHer?: number;
  keptPercent: number;
  tellsPerCase: number;
  countedPer1k?: number;
  herCountedPer1k?: number;
  headToHead?: HeadToHead;
  real?: RealResults;
};

/** Readable prose from a blog JSON draft (lead, section heads and bodies, close); other bodies as is. */
export function evalText(body: string): string {
  const row = parseBlogJson(body) as Record<string, unknown> | null;
  if (!row) return tidy(body);
  const parts: string[] = [];
  if (typeof row.lead === "string") parts.push(row.lead);
  if (Array.isArray(row.sections)) {
    for (const section of row.sections as Array<Record<string, unknown> | null>) {
      if (typeof section?.heading === "string") parts.push(section.heading);
      if (typeof section?.body === "string") parts.push(section.body);
    }
  }
  if (typeof row.cta === "string") parts.push(row.cta);
  return tidy(parts.join("\n\n"));
}

/** Markdown marks, link syntax and stray spaces before punctuation (an HTML-copy artifact) out. */
export function tidy(text: string): string {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+([,.;:!?)])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function firstWords(text: string, max = EVAL_MAX_WORDS): string {
  let count = 0;
  let out = "";
  for (const piece of text.split(/(\s+)/)) {
    if (/\S/.test(piece)) count += 1;
    if (count > max) break;
    out += piece;
  }
  return out.trim();
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

/** Share of the draft's words that are still in what she published, 0–100. */
export function keptPercent(draft: string, published: string): number {
  const source = tokens(draft);
  if (source.length === 0) return 0;
  const available = new Map<string, number>();
  for (const token of tokens(published)) available.set(token, (available.get(token) ?? 0) + 1);
  let kept = 0;
  for (const token of source) {
    const left = available.get(token) ?? 0;
    if (left > 0) {
      kept += 1;
      available.set(token, left - 1);
    }
  }
  return Math.round((100 * kept) / source.length);
}

/** Passes when the judge could not pick her real piece in both orders. */
export function passedFromJudge(correct: number): boolean {
  return correct < 2;
}

/** Em-dashes, "it's not X, it's Y" and lists of three, per 1,000 words. */
export function countedTellsPer1k(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  const count = countEmDashes(text) + countAntitheses(text) + findTricolons(text).length;
  return Math.round((count / words) * 1000 * 10) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeEval(cases: EvalCaseScore[], real?: RealResults): EvalScores {
  const scored = cases.filter((c) => !c.error && c.drafts.length > 0);
  const drafts = scored.flatMap((c) => c.drafts);
  const h2h = scored.filter((c) => c.headToHead).map((c) => c.headToHead!);
  return {
    passes: drafts.filter((d) => d.passed).length,
    cases: scored.length,
    drafts: drafts.length,
    likeHer: round1(mean(drafts.map((d) => d.likeHer))),
    keptPercent: Math.round(mean(drafts.map((d) => d.keptPercent))),
    tellsPerCase: round1(mean(drafts.map((d) => d.tells))),
    countedPer1k: round1(mean(drafts.map((d) => d.countedPer1k))),
    herCountedPer1k: round1(mean(scored.map((c) => c.herCountedPer1k))),
    ...(h2h.length > 0
      ? {
          headToHead: {
            wins: h2h.reduce((a, h) => a + h.wins, 0),
            ties: h2h.reduce((a, h) => a + h.ties, 0),
            losses: h2h.reduce((a, h) => a + h.losses, 0),
          },
        }
      : {}),
    ...(real ? { real } : {}),
  };
}

/** Median of days between each real draft and the piece going live. */
export function medianDays(spans: number[]): number | null {
  if (spans.length === 0) return null;
  const sorted = [...spans].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
}

export type EvalTrigger = "new-cases" | "monthly";

/** Whether a scheduled run is due, and why. Null when not. */
export function evalDue(input: {
  caseCount: number;
  casesSinceLastRun: number;
  lastRunAt: Date | null;
  now: Date;
}): EvalTrigger | null {
  if (input.caseCount === 0) return null;
  if (!input.lastRunAt) return input.caseCount >= EVAL_NEW_CASES_DUE ? "new-cases" : null;
  if (input.casesSinceLastRun >= EVAL_NEW_CASES_DUE) return "new-cases";
  if (input.now.getTime() - input.lastRunAt.getTime() >= EVAL_MONTHLY_MS) return "monthly";
  return null;
}

/** Drafts that passed, as a share of drafts (older runs scored one draft per case). */
export function passRate(s: EvalScores): number {
  const n = s.drafts ?? s.cases;
  return n === 0 ? 0 : s.passes / n;
}

/**
 * A later scheduled run scored worse: a lower pass rate, half a point less on
 * sounds-like-her, 5+ points less kept, or half a tell more per draft.
 */
export function scoresDropped(previous: EvalScores, next: EvalScores): boolean {
  if (previous.cases === 0 || next.cases === 0) return false;
  const likeHerDrop =
    previous.likeHer !== undefined && next.likeHer !== undefined && next.likeHer <= previous.likeHer - 0.5;
  return (
    passRate(next) < passRate(previous) ||
    likeHerDrop ||
    next.keptPercent <= previous.keptPercent - 5 ||
    next.tellsPerCase >= previous.tellsPerCase + 0.5
  );
}

/**
 * A candidate beat the baseline. With head-to-head: it won more comparisons than
 * it lost, and kept at most 2 points less. Without (older runs): a higher pass
 * rate and kept no lower.
 */
export function candidateBeat(baseline: EvalScores, candidate: EvalScores): boolean {
  if (baseline.cases === 0 || candidate.cases === 0) return false;
  if (candidate.headToHead) {
    const { wins, losses } = candidate.headToHead;
    return wins > losses && candidate.keptPercent >= baseline.keptPercent - 2;
  }
  return passRate(candidate) > passRate(baseline) && candidate.keptPercent >= baseline.keptPercent;
}

/** The first balanced {...} in a model reply. */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON in reply");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("unclosed JSON in reply");
}
