import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  generationLog: { findFirst: vi.fn(), findMany: vi.fn() },
  evalCase: { upsert: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  evalRun: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
}));
vi.mock("./db", () => ({ prisma: db }));

const store = vi.hoisted(() => ({
  generateForProfile: vi.fn(),
  getProfile: vi.fn(),
  listLearnings: vi.fn(),
}));
vi.mock("./store", () => store);

import { EvalCaseError, evalAlerts, evalStatus, runEval, upsertEvalCase } from "./eval";

beforeEach(() => {
  for (const group of Object.values(db)) for (const fn of Object.values(group)) fn.mockReset();
  for (const fn of Object.values(store)) fn.mockReset();
});

describe("upsertEvalCase", () => {
  it("takes the brief from Voice's own log of the piece when no facts are sent", async () => {
    db.generationLog.findFirst.mockResolvedValue({
      id: "gen-9", facts: "THE BRIEF", architecture: "event-notes", model: "claude-opus-4-6", style: "plain",
    });
    db.evalCase.upsert.mockResolvedValue({ id: "c1" });
    await upsertEvalCase({ profileId: "woolgrown", sourceId: "royal", surfaceId: "blog", finalBody: "Her post." });
    expect(db.generationLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profileId: "woolgrown", seed: "royal", surfaceId: "blog" } }),
    );
    const args = db.evalCase.upsert.mock.calls[0]![0];
    expect(args.create).toMatchObject({ sourceId: "royal", facts: "THE BRIEF", architecture: "event-notes", generationId: "gen-9", finalBody: "Her post." });
  });

  it("uses the facts a host sends, for pieces drafted before Voice logged them", async () => {
    db.generationLog.findFirst.mockResolvedValue(null);
    db.evalCase.upsert.mockResolvedValue({ id: "c2" });
    await upsertEvalCase({ profileId: "woolgrown", sourceId: "urban", surfaceId: "blog", finalBody: "Hers.", facts: "Rebuilt brief" });
    expect(db.evalCase.upsert.mock.calls[0]![0].create).toMatchObject({ facts: "Rebuilt brief", generationId: null });
  });

  it("keeps the link to her real draft when a host sends a fresher brief", async () => {
    db.generationLog.findFirst.mockResolvedValue({
      id: "gen-7", facts: "OLD BRIEF", architecture: "proof-story", model: "claude-opus-4-6", style: "plain",
    });
    db.evalCase.upsert.mockResolvedValue({ id: "c3" });
    await upsertEvalCase({
      profileId: "woolgrown", sourceId: "calgary", surfaceId: "blog", finalBody: "Hers.", facts: "Today's brief", architecture: "event-notes",
    });
    const args = db.evalCase.upsert.mock.calls[0]![0];
    expect(args.update).toMatchObject({ facts: "Today's brief", architecture: "event-notes", generationId: "gen-7" });
  });

  it("refuses a piece with no brief anywhere, and an empty published body", async () => {
    db.generationLog.findFirst.mockResolvedValue(null);
    await expect(upsertEvalCase({ profileId: "woolgrown", sourceId: "x", surfaceId: "blog", finalBody: "Hers." })).rejects.toBeInstanceOf(EvalCaseError);
    await expect(upsertEvalCase({ profileId: "woolgrown", sourceId: "x", surfaceId: "blog", finalBody: "  " })).rejects.toBeInstanceOf(EvalCaseError);
  });
});

describe("evalStatus", () => {
  it("reports due once enough new cases came in since the last scheduled run", async () => {
    const last = new Date("2026-10-30T00:00:00.000Z");
    db.evalCase.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);
    db.evalRun.findMany.mockResolvedValue([
      { id: "cand", status: "done", trigger: "candidate", label: "x", caseCount: 7, scoresJson: "{}", startedAt: new Date("2026-10-31T00:00:00.000Z"), finishedAt: null, error: null },
      { id: "r1", status: "done", trigger: "new-cases", label: null, caseCount: 7, scoresJson: '{"passes":2,"cases":7,"keptPercent":50,"tellsPerCase":1}', startedAt: last, finishedAt: last, error: null },
    ]);
    const status = await evalStatus("woolgrown", new Date("2026-11-01T00:00:00.000Z"));
    expect(db.evalCase.count).toHaveBeenLastCalledWith({ where: { profileId: "woolgrown", createdAt: { gt: last } } });
    expect(status.due).toBe("new-cases");
    expect(status.runs[1]!.scores).toEqual({ passes: 2, cases: 7, keptPercent: 50, tellsPerCase: 1 });
  });

  it("is not due while a run is still going", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    db.evalCase.count.mockResolvedValue(9);
    db.evalRun.findMany.mockResolvedValue([
      { id: "live", status: "running", trigger: "new-cases", label: null, caseCount: 0, scoresJson: "{}", startedAt: new Date(now.getTime() - 60_000), finishedAt: null, error: null },
    ]);
    const status = await evalStatus("woolgrown", now);
    expect(status.running).toBe("live");
    expect(status.due).toBeNull();
  });
});

describe("runEval", () => {
  const cases = [
    { sourceId: "urban", surfaceId: "blog", facts: "Urban brief", architecture: "how-to-steps", model: "claude-opus-4-6", style: "plain", finalBody: "If you're gardening in the city, wool can help you succeed!", generationId: "gen-1", createdAt: new Date("2026-09-04T00:00:00.000Z") },
    { sourceId: "broken", surfaceId: "blog", facts: "Brief", architecture: null, model: null, style: "plain", finalBody: "Hers.", generationId: null, createdAt: new Date("2026-09-05T00:00:00.000Z") },
  ];

  /** Judge replies per draft: two blind picks, a 1–10 score, the tells check. */
  function judge(score: number) {
    return vi.fn(async (input: { system: string; user: string }) => {
      if (input.system.includes("rate how much")) return `{"score": ${score}, "why": "plain"}`;
      if (input.system.includes("standing rules")) return '{"broken":[1]}';
      if (input.system.includes("compare two drafts")) return '{"pick":"A"}';
      return '{"pick":"unsure"}';
    });
  }

  it("writes several drafts per case with its own piece left out, scores each, and adds real results", async () => {
    store.getProfile.mockResolvedValue({ name: "WoolGrown" });
    store.listLearnings.mockResolvedValue([
      { rule: "No recap lines.", surface: "blog", sourceDraftId: null },
      { rule: "Rule from urban itself.", surface: "blog", sourceDraftId: "urban" },
      { rule: "FAQ rule.", surface: "shop_faq", sourceDraftId: null },
    ]);
    db.evalCase.findMany.mockResolvedValue(cases);
    db.generationLog.findMany = vi.fn().mockResolvedValue([
      { id: "gen-1", generatedBody: "If you're gardening in the city, wool helps.", createdAt: new Date("2026-09-01T00:00:00.000Z") },
    ]);
    store.generateForProfile.mockImplementation(async (input: { leaveOut: string }) => {
      if (input.leaveOut === "broken") throw new Error("model down");
      return { body: JSON.stringify({ lead: "Wool can help city gardens — really.", sections: [], cta: "Try it." }) };
    });
    const complete = judge(6);
    await runEval("run-1", { profileId: "woolgrown", trigger: "manual", drafts: 3, complete });

    expect(store.generateForProfile).toHaveBeenCalledTimes(3 + 3);
    expect(store.generateForProfile).toHaveBeenCalledWith(
      expect.objectContaining({ leaveOut: "urban", log: false, seed: "urban", format: "blog", model: "claude-opus-4-6" }),
    );
    const tellsPrompt = complete.mock.calls.find((c) => c[0].system.includes("standing rules"))![0];
    expect(tellsPrompt.user).toContain("1. No recap lines.");
    expect(tellsPrompt.user).not.toContain("Rule from urban itself.");
    expect(tellsPrompt.user).not.toContain("FAQ rule.");

    const saved = db.evalRun.update.mock.calls.at(-1)![0].data;
    expect(saved.status).toBe("done");
    const scores = JSON.parse(saved.scoresJson);
    expect(scores).toMatchObject({ passes: 3, cases: 1, drafts: 3, likeHer: 6, tellsPerCase: 1, real: { cases: 1, medianDaysToLive: 3 } });
    expect(scores.countedPer1k).toBeGreaterThan(0);
    expect(scores.headToHead).toBeUndefined();
    const perCase = JSON.parse(saved.casesJson);
    expect(perCase[0].drafts).toHaveLength(3);
    expect(perCase[0].drafts[0]).toMatchObject({ passed: true, likeHer: 6, tellsBroken: ["No recap lines."] });
    expect(perCase[0].drafts[0].draft).toContain("Wool can help city gardens");
    expect(perCase[1]).toMatchObject({ sourceId: "broken", error: "model down", drafts: [] });
  });

  it("compares a candidate's drafts head-to-head with the last baseline run, and may try another model", async () => {
    store.getProfile.mockResolvedValue({ name: "WoolGrown" });
    store.listLearnings.mockResolvedValue([]);
    db.evalCase.findMany.mockResolvedValue([cases[0]]);
    db.generationLog.findMany = vi.fn().mockResolvedValue([]);
    db.evalRun.findMany.mockResolvedValue([
      { casesJson: JSON.stringify([{ sourceId: "urban", drafts: [{ draft: "Old draft one." }, { draft: "Old draft two." }] }]) },
    ]);
    store.generateForProfile.mockResolvedValue({ body: "New draft." });
    const complete = judge(5);
    await runEval("run-2", { profileId: "woolgrown", trigger: "candidate", model: "claude-opus-5-5", drafts: 2, complete });
    expect(store.generateForProfile).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-5-5" }));
    expect(db.evalRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "done", NOT: { trigger: "candidate" } }) }));
    const scores = JSON.parse(db.evalRun.update.mock.calls.at(-1)![0].data.scoresJson);
    // The judge always picks "A": one win and one loss per pair, so both pairs tie.
    expect(scores.headToHead).toEqual({ wins: 0, ties: 2, losses: 0 });
  });

  it("compares a candidate against a named run when given one, and records it", async () => {
    store.getProfile.mockResolvedValue({ name: "WoolGrown" });
    store.listLearnings.mockResolvedValue([]);
    db.evalCase.findMany.mockResolvedValue([cases[0]]);
    db.generationLog.findMany = vi.fn().mockResolvedValue([]);
    db.evalRun.findMany.mockResolvedValue([
      { casesJson: JSON.stringify([{ sourceId: "urban", drafts: [{ draft: "Clean-up draft." }] }]) },
    ]);
    store.generateForProfile.mockResolvedValue({ body: "New draft." });
    await runEval("run-4", { profileId: "woolgrown", trigger: "candidate", variant: "cleanup+captions", against: "run-cleanup", drafts: 1, complete: judge(5) });
    expect(db.evalRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "run-cleanup", profileId: "woolgrown", status: "done" } }),
    );
    expect(store.generateForProfile).toHaveBeenCalledWith(expect.objectContaining({ variant: "cleanup+captions" }));
    const scores = JSON.parse(db.evalRun.update.mock.calls.at(-1)![0].data.scoresJson);
    expect(scores.against).toBe("run-cleanup");
    expect(scores.headToHead).toEqual({ wins: 0, ties: 1, losses: 0 });
  });

  it("fails a candidate run whose named run doesn't exist", async () => {
    store.getProfile.mockResolvedValue({ name: "WoolGrown" });
    store.listLearnings.mockResolvedValue([]);
    db.evalCase.findMany.mockResolvedValue([cases[0]]);
    db.evalRun.findMany.mockResolvedValue([]);
    await runEval("run-5", { profileId: "woolgrown", trigger: "candidate", against: "nope", complete: judge(5) });
    expect(db.evalRun.update.mock.calls.at(-1)![0].data).toMatchObject({ status: "failed", error: "No finished run nope to compare against" });
  });

  it("saves the run as failed instead of throwing when it cannot start", async () => {
    store.getProfile.mockRejectedValue(new Error("Unknown profile: nope"));
    store.listLearnings.mockResolvedValue([]);
    db.evalCase.findMany.mockResolvedValue([]);
    await expect(runEval("run-3", { profileId: "nope", trigger: "manual" })).resolves.toBeUndefined();
    expect(db.evalRun.update.mock.calls.at(-1)![0].data).toMatchObject({ status: "failed", error: "Unknown profile: nope" });
  });
});

describe("evalAlerts", () => {
  const run = (id: string, trigger: string, day: number, passes: number, kept: number, caseCount = 7, label: string | null = null) => ({
    id, status: "done", trigger, label, caseCount,
    scores: { passes, cases: caseCount, keptPercent: kept, tellsPerCase: 1 },
    startedAt: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`, finishedAt: null, error: null,
  });

  it("flags the newest scheduled run scoring worse than the one before, with how many cases are new", () => {
    const out = evalAlerts([run("r2", "new-cases", 20, 2, 48, 10), run("r1", "new-cases", 10, 3, 55, 7)]);
    expect(out.dropped).toMatchObject({ runId: "r2", newCases: 3, before: { passes: 3 }, after: { passes: 2 } });
    expect(out.candidateBeat).toBeNull();
  });

  it("flags a candidate that beat the scheduled run before it, and ignores candidates for the drop check", () => {
    const out = evalAlerts([
      run("c1", "candidate", 25, 5, 58, 7, "her writing in the prompt"),
      run("r2", "monthly", 20, 3, 55),
      run("r1", "new-cases", 10, 3, 55),
    ]);
    expect(out.candidateBeat).toMatchObject({ runId: "c1", label: "her writing in the prompt", before: { passes: 3 }, after: { passes: 5 } });
    expect(out.dropped).toBeNull();
  });

  it("stays quiet with fewer than two scheduled runs or failed runs", () => {
    expect(evalAlerts([run("r1", "new-cases", 10, 3, 55)])).toEqual({ dropped: null, candidateBeat: null });
  });

  it("judges a candidate against the run it named, not the last scheduled run", () => {
    const named = { ...run("c2", "candidate", 22, 2, 50, 7, "Captions"), scores: { passes: 2, cases: 7, keptPercent: 50, tellsPerCase: 1, against: "c1" } };
    const cleanup = run("c1", "candidate", 21, 3, 50, 7, "Clean-up");
    const plain = run("r1", "new-cases", 10, 1, 40);
    // Beats plain Voice, but not the clean-up run it was measured against.
    expect(evalAlerts([named, cleanup, plain]).candidateBeat).toBeNull();
    // Named run missing from the list: no alert rather than the wrong comparison.
    expect(evalAlerts([named, plain]).candidateBeat).toBeNull();
    expect(evalAlerts([{ ...run("r2", "new-cases", 20, 0, 0), status: "failed" }, run("r1", "new-cases", 10, 3, 55)])).toEqual({ dropped: null, candidateBeat: null });
  });
});
