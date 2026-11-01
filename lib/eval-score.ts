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

/** Both texts are cut to the same length so length never gives the draft away. */
export const EVAL_MAX_WORDS = 380;
/** A run is due after this many new cases… */
export const EVAL_NEW_CASES_DUE = 3;
/** …or this long after the last run, so learned rules drifting is caught too. */
export const EVAL_MONTHLY_MS = 30 * 24 * 60 * 60 * 1000;
/** A run still "running" after this long is treated as dead. */
export const EVAL_STALE_RUN_MS = 2 * 60 * 60 * 1000;

export type EvalCaseScore = {
  sourceId: string;
  passed: boolean;
  /** 0, 1 or 2: how many orders the judge picked her real piece. */
  judgeCorrect: number;
  keptPercent: number;
  tells: number;
  judgeWhy: string[];
  tellsBroken: string[];
  error?: string;
};

export type EvalScores = {
  passes: number;
  cases: number;
  keptPercent: number;
  tellsPerCase: number;
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

export function summarizeEval(cases: EvalCaseScore[]): EvalScores {
  const scored = cases.filter((c) => !c.error);
  const n = scored.length;
  const avg = (pick: (c: EvalCaseScore) => number) =>
    n === 0 ? 0 : Math.round((scored.reduce((sum, c) => sum + pick(c), 0) / n) * 10) / 10;
  return {
    passes: scored.filter((c) => c.passed).length,
    cases: n,
    keptPercent: Math.round(avg((c) => c.keptPercent)),
    tellsPerCase: avg((c) => c.tells),
  };
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

/** A later scheduled run scored worse: fewer passes, 5+ points less kept, or half a tell more per piece. */
export function scoresDropped(previous: EvalScores, next: EvalScores): boolean {
  if (previous.cases === 0 || next.cases === 0) return false;
  const passRate = (s: EvalScores) => s.passes / s.cases;
  return (
    passRate(next) < passRate(previous) ||
    next.keptPercent <= previous.keptPercent - 5 ||
    next.tellsPerCase >= previous.tellsPerCase + 0.5
  );
}

/** A candidate beat the baseline: more passes, and kept no lower. */
export function candidateBeat(baseline: EvalScores, candidate: EvalScores): boolean {
  if (baseline.cases === 0 || candidate.cases === 0) return false;
  return (
    candidate.passes / candidate.cases > baseline.passes / baseline.cases &&
    candidate.keptPercent >= baseline.keptPercent
  );
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
