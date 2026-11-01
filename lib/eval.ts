/**
 * Voice eval: a practice exam built from what each profile's person actually
 * published. A case is the brief Voice was given plus the published piece; a run
 * writes every case again (leaving that piece's own golds and rules out), scores
 * the drafts and saves a scorecard. Hosts add cases when a piece goes live and ask
 * for a run when one is due (see evalDue). Server only.
 */

import { prisma } from "./db";
import {
  candidateBeat,
  EVAL_STALE_RUN_MS,
  evalDue,
  evalText,
  firstJsonObject,
  firstWords,
  keptPercent,
  passedFromJudge,
  scoresDropped,
  summarizeEval,
  type EvalCaseScore,
  type EvalScores,
} from "./eval-score";
import { leaveOutSource } from "./eval-source";
import { completeDraft, DRAFT_MODEL } from "./generate";
import { generateForProfile, getProfile, listLearnings } from "./store";

export class EvalCaseError extends Error {}

export type EvalCaseInput = {
  profileId: string;
  sourceId: string;
  surfaceId: string;
  finalBody: string;
  /** Left out: taken from the newest GenerationLog for this piece. */
  facts?: string;
  architecture?: string;
  model?: string;
  style?: "plain" | "crafted";
};

/** Add or refresh one case. Without facts, the brief comes from Voice's own log of that piece. */
export async function upsertEvalCase(input: EvalCaseInput) {
  const sourceId = input.sourceId.trim();
  const finalBody = input.finalBody.trim();
  if (!sourceId || !finalBody) throw new EvalCaseError("sourceId and finalBody are required");
  let facts = input.facts?.trim() ?? "";
  let architecture = input.architecture ?? null;
  let model = input.model ?? null;
  let style: string = input.style ?? "plain";
  let generationId: string | null = null;
  if (!facts) {
    const log = await prisma.generationLog.findFirst({
      where: { profileId: input.profileId, seed: sourceId, surfaceId: input.surfaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, facts: true, architecture: true, model: true, style: true },
    });
    if (!log) throw new EvalCaseError(`No brief for ${sourceId}: send facts, or draft it through Voice first`);
    facts = log.facts;
    architecture = architecture ?? log.architecture;
    model = model ?? log.model;
    style = input.style ?? log.style;
    generationId = log.id;
  }
  const data = {
    surfaceId: input.surfaceId,
    architecture,
    facts,
    model,
    style,
    finalBody,
    generationId,
  };
  return prisma.evalCase.upsert({
    where: { profileId_sourceId: { profileId: input.profileId, sourceId } },
    create: { profileId: input.profileId, sourceId, ...data },
    update: data,
    select: { id: true, sourceId: true, generationId: true, updatedAt: true },
  });
}

type RunSummary = {
  id: string;
  status: string;
  trigger: string;
  label: string | null;
  caseCount: number;
  scores: EvalScores | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

function toSummary(row: {
  id: string;
  status: string;
  trigger: string;
  label: string | null;
  caseCount: number;
  scoresJson: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}): RunSummary {
  let scores: EvalScores | null = null;
  try {
    const parsed = JSON.parse(row.scoresJson) as Partial<EvalScores>;
    if (typeof parsed.cases === "number") scores = parsed as EvalScores;
  } catch {
    scores = null;
  }
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    label: row.label,
    caseCount: row.caseCount,
    scores,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    error: row.error,
  };
}

type RunAlert = { runId: string; label: string | null; before: EvalScores; after: EvalScores; newCases: number };

/**
 * What a host should tell someone: the newest scheduled run scored worse than the
 * one before it, and/or the newest candidate run beat the scheduled run before it.
 */
export function evalAlerts(runs: RunSummary[]): { dropped: RunAlert | null; candidateBeat: RunAlert | null } {
  const done = runs.filter((r) => r.status === "done" && r.scores && r.scores.cases > 0);
  const scheduled = done.filter((r) => r.trigger !== "candidate");
  let dropped: RunAlert | null = null;
  const [latest, previous] = scheduled;
  if (latest?.scores && previous?.scores && scoresDropped(previous.scores, latest.scores)) {
    dropped = {
      runId: latest.id,
      label: null,
      before: previous.scores,
      after: latest.scores,
      newCases: Math.max(0, latest.caseCount - previous.caseCount),
    };
  }
  let beat: RunAlert | null = null;
  const candidate = done.find((r) => r.trigger === "candidate");
  const baseline = candidate ? scheduled.find((r) => r.startedAt <= candidate.startedAt) : undefined;
  if (candidate?.scores && baseline?.scores && candidateBeat(baseline.scores, candidate.scores)) {
    beat = { runId: candidate.id, label: candidate.label, before: baseline.scores, after: candidate.scores, newCases: 0 };
  }
  return { dropped, candidateBeat: beat };
}

/** Cases, recent runs, alerts, and whether a scheduled run is due. */
export async function evalStatus(profileId: string, now = new Date()) {
  const [caseCount, runs] = await Promise.all([
    prisma.evalCase.count({ where: { profileId } }),
    prisma.evalRun.findMany({ where: { profileId }, orderBy: { startedAt: "desc" }, take: 12 }),
  ]);
  const lastScheduled = runs.find((r) => r.status !== "failed" && r.trigger !== "candidate");
  const casesSinceLastRun = lastScheduled
    ? await prisma.evalCase.count({ where: { profileId, createdAt: { gt: lastScheduled.startedAt } } })
    : caseCount;
  const running = runs.find(
    (r) => r.status === "running" && now.getTime() - r.startedAt.getTime() < EVAL_STALE_RUN_MS,
  );
  return {
    caseCount,
    casesSinceLastRun,
    running: running ? running.id : null,
    due: running
      ? null
      : evalDue({ caseCount, casesSinceLastRun, lastRunAt: lastScheduled?.startedAt ?? null, now }),
    runs: runs.map(toSummary),
    alerts: evalAlerts(runs.map(toSummary)),
  };
}

type Complete = (input: { system: string; user: string }) => Promise<string>;
type Generate = typeof generateForProfile;

export type EvalRunOptions = {
  profileId: string;
  trigger: string;
  label?: string;
  /** Candidate runs may try another draft model. */
  model?: string;
  complete?: Complete;
  generate?: Generate;
};

/** Creates the run row; the caller awaits runEval(run.id, …) in the background. */
export async function createEvalRun(input: { profileId: string; trigger: string; label?: string }) {
  return prisma.evalRun.create({
    data: { profileId: input.profileId, trigger: input.trigger, label: input.label ?? null },
    select: { id: true },
  });
}

const judgeComplete: Complete = (prompt) => completeDraft({ ...prompt, model: DRAFT_MODEL });

function judgeSystem(name: string): string {
  return [
    `You check whether a draft could pass as ${name}'s own writing.`,
    `You get two pieces on the same subject. One was published by ${name}. The other was drafted by AI.`,
    "Judge the writing itself: word choice, rhythm, warmth, how people are introduced, what is left out. Ignore facts and length; both are cut to similar length.",
    'Return only JSON: {"pick": "A" | "B" | "unsure", "why": "one short sentence"}.',
  ].join("\n");
}

function tellsSystem(): string {
  return [
    "You check a draft against a writer's standing rules.",
    "List which numbered rules the draft clearly breaks. Only count clear breaks, not borderline ones.",
    'Return only JSON: {"broken": [rule numbers]}.',
  ].join("\n");
}

async function scoreCase(input: {
  name: string;
  sourceId: string;
  draft: string;
  published: string;
  rules: string[];
  complete: Complete;
}): Promise<EvalCaseScore> {
  const draft = firstWords(input.draft);
  const published = firstWords(input.published);
  let correct = 0;
  const judgeWhy: string[] = [];
  for (const realFirst of [true, false]) {
    const [a, b] = realFirst ? [published, draft] : [draft, published];
    const reply = firstJsonObject(
      await input.complete({ system: judgeSystem(input.name), user: `=== A ===\n${a}\n\n=== B ===\n${b}` }),
    ) as { pick?: string; why?: string };
    const pick = String(reply.pick ?? "").trim().toUpperCase();
    if ((realFirst && pick === "A") || (!realFirst && pick === "B")) correct += 1;
    if (reply.why) judgeWhy.push(String(reply.why));
  }
  let tellsBroken: string[] = [];
  if (input.rules.length > 0) {
    const reply = firstJsonObject(
      await input.complete({
        system: tellsSystem(),
        user: `Rules:\n${input.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\nDraft:\n${draft}`,
      }),
    ) as { broken?: unknown };
    const numbers = Array.isArray(reply.broken) ? reply.broken : [];
    tellsBroken = numbers
      .map((n) => input.rules[Number(n) - 1])
      .filter((rule): rule is string => Boolean(rule));
  }
  return {
    sourceId: input.sourceId,
    passed: passedFromJudge(correct),
    judgeCorrect: correct,
    keptPercent: keptPercent(input.draft, input.published),
    tells: tellsBroken.length,
    judgeWhy,
    tellsBroken,
  };
}

/** Runs every case and saves the scorecard. Never throws: a failure is saved on the run. */
export async function runEval(runId: string, options: EvalRunOptions): Promise<void> {
  const complete = options.complete ?? judgeComplete;
  const generate = options.generate ?? generateForProfile;
  try {
    const [profile, cases, learnings] = await Promise.all([
      getProfile(options.profileId),
      prisma.evalCase.findMany({ where: { profileId: options.profileId }, orderBy: { createdAt: "asc" } }),
      listLearnings(options.profileId),
    ]);
    await prisma.evalRun.update({ where: { id: runId }, data: { caseCount: cases.length } });
    const scored: EvalCaseScore[] = [];
    for (const item of cases) {
      try {
        const result = await generate({
          profileId: options.profileId,
          surface: item.surfaceId,
          facts: item.facts,
          seed: item.sourceId,
          architecture: item.architecture ?? undefined,
          format: item.surfaceId === "blog" ? "blog" : "plain",
          model: options.model ?? item.model ?? undefined,
          style: item.style === "crafted" ? "crafted" : "plain",
          leaveOut: item.sourceId,
          log: false,
        });
        const rules = leaveOutSource([], learnings, item.sourceId)
          .learnings.filter((l) => !l.surface || l.surface === item.surfaceId)
          .map((l) => l.rule);
        scored.push(
          await scoreCase({
            name: profile.name,
            sourceId: item.sourceId,
            draft: evalText(result.body),
            published: evalText(item.finalBody),
            rules,
            complete,
          }),
        );
      } catch (err) {
        scored.push({
          sourceId: item.sourceId,
          passed: false,
          judgeCorrect: 0,
          keptPercent: 0,
          tells: 0,
          judgeWhy: [],
          tellsBroken: [],
          error: err instanceof Error ? err.message.slice(0, 240) : String(err),
        });
      }
    }
    await prisma.evalRun.update({
      where: { id: runId },
      data: {
        status: "done",
        scoresJson: JSON.stringify(summarizeEval(scored)),
        casesJson: JSON.stringify(scored),
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    try {
      await prisma.evalRun.update({
        where: { id: runId },
        data: { status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : String(err), finishedAt: new Date() },
      });
    } catch {
      // The run stays "running" and goes stale after EVAL_STALE_RUN_MS.
    }
  }
}
