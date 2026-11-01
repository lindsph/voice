import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  generationLog: { findFirst: vi.fn() },
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
    db.evalCase.upsert.mockResolvedValue({ id: "c2" });
    await upsertEvalCase({ profileId: "woolgrown", sourceId: "urban", surfaceId: "blog", finalBody: "Hers.", facts: "Rebuilt brief" });
    expect(db.generationLog.findFirst).not.toHaveBeenCalled();
    expect(db.evalCase.upsert.mock.calls[0]![0].create).toMatchObject({ facts: "Rebuilt brief", generationId: null });
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
    { sourceId: "urban", surfaceId: "blog", facts: "Urban brief", architecture: "how-to-steps", model: "claude-opus-4-6", style: "plain", finalBody: "If you're gardening in the city, wool can help you succeed!" },
    { sourceId: "broken", surfaceId: "blog", facts: "Brief", architecture: null, model: null, style: "plain", finalBody: "Hers." },
  ];

  it("writes each case with its own piece left out, scores it, and saves the scorecard", async () => {
    store.getProfile.mockResolvedValue({ name: "WoolGrown" });
    store.listLearnings.mockResolvedValue([
      { rule: "No recap lines.", surface: "blog", sourceDraftId: null },
      { rule: "Rule from urban itself.", surface: "blog", sourceDraftId: "urban" },
      { rule: "FAQ rule.", surface: "shop_faq", sourceDraftId: null },
    ]);
    db.evalCase.findMany.mockResolvedValue(cases);
    store.generateForProfile.mockImplementation(async (input: { leaveOut: string }) => {
      if (input.leaveOut === "broken") throw new Error("model down");
      return { body: JSON.stringify({ lead: "Wool can help city gardens.", sections: [], cta: "Try it." }) };
    });
    const complete = vi
      .fn()
      .mockResolvedValueOnce('{"pick":"A","why":"real first"}') // real piece first, judge right
      .mockResolvedValueOnce('{"pick":"A","why":"fooled"}') // draft first, judge picked the draft
      .mockResolvedValueOnce('{"broken":[1]}');
    await runEval("run-1", { profileId: "woolgrown", trigger: "manual", complete });

    expect(store.generateForProfile).toHaveBeenCalledWith(
      expect.objectContaining({ leaveOut: "urban", log: false, seed: "urban", format: "blog", model: "claude-opus-4-6" }),
    );
    const tellsPrompt = complete.mock.calls[2]![0].user as string;
    expect(tellsPrompt).toContain("1. No recap lines.");
    expect(tellsPrompt).not.toContain("Rule from urban itself.");
    expect(tellsPrompt).not.toContain("FAQ rule.");

    const saved = db.evalRun.update.mock.calls.at(-1)![0].data;
    expect(saved.status).toBe("done");
    expect(JSON.parse(saved.scoresJson)).toEqual({ passes: 1, cases: 1, keptPercent: expect.any(Number), tellsPerCase: 1 });
    const perCase = JSON.parse(saved.casesJson);
    expect(perCase[0]).toMatchObject({ sourceId: "urban", passed: true, judgeCorrect: 1, tellsBroken: ["No recap lines."] });
    expect(perCase[1]).toMatchObject({ sourceId: "broken", error: "model down" });
  });

  it("lets a candidate run try another draft model", async () => {
    store.getProfile.mockResolvedValue({ name: "WoolGrown" });
    store.listLearnings.mockResolvedValue([]);
    db.evalCase.findMany.mockResolvedValue([cases[0]]);
    store.generateForProfile.mockResolvedValue({ body: "Draft." });
    const complete = vi.fn().mockResolvedValue('{"pick":"unsure"}');
    await runEval("run-2", { profileId: "woolgrown", trigger: "candidate", model: "claude-opus-5-5", complete });
    expect(store.generateForProfile).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-5-5" }));
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
    expect(evalAlerts([{ ...run("r2", "new-cases", 20, 0, 0), status: "failed" }, run("r1", "new-cases", 10, 3, 55)])).toEqual({ dropped: null, candidateBeat: null });
  });
});
