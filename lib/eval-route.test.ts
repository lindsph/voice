import { beforeEach, describe, expect, it, vi } from "vitest";

const evalLib = vi.hoisted(() => ({
  evalStatus: vi.fn(),
  createEvalRun: vi.fn(),
  runEval: vi.fn(),
  upsertEvalCase: vi.fn(),
  EvalCaseError: class EvalCaseError extends Error {},
}));
vi.mock("@/lib/eval", () => evalLib);
vi.mock("@/lib/auth", () => ({ authorize: (r: Request) => r.headers.get("x-voice-key") === "k" }));
const afterFns = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => unknown) => afterFns.push(fn) };
});

import { POST as postCase } from "../app/api/profiles/[id]/evals/cases/route";
import { POST as postRun } from "../app/api/profiles/[id]/evals/run/route";

const params = { params: Promise.resolve({ id: "woolgrown" }) };
const req = (body: unknown, key = "k") =>
  new Request("http://x/api", { method: "POST", headers: { "x-voice-key": key, "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  for (const fn of [evalLib.evalStatus, evalLib.createEvalRun, evalLib.runEval, evalLib.upsertEvalCase]) fn.mockReset();
  afterFns.length = 0;
});

describe("POST /evals/run", () => {
  it("starts nothing when a scheduled run isn't due", async () => {
    evalLib.evalStatus.mockResolvedValue({ running: null, due: null, caseCount: 4 });
    const res = await postRun(req({ ifDue: true }), params);
    expect(await res.json()).toEqual({ started: false, reason: "not-due", caseCount: 4 });
    expect(evalLib.createEvalRun).not.toHaveBeenCalled();
  });

  it("starts a due run in the background with the due trigger", async () => {
    evalLib.evalStatus.mockResolvedValue({ running: null, due: "monthly", caseCount: 7 });
    evalLib.createEvalRun.mockResolvedValue({ id: "run-1" });
    const res = await postRun(req({ ifDue: true }), params);
    expect(await res.json()).toEqual({ started: true, runId: "run-1", trigger: "monthly" });
    expect(afterFns).toHaveLength(1);
    await afterFns[0]!();
    expect(evalLib.runEval).toHaveBeenCalledWith("run-1", expect.objectContaining({ profileId: "woolgrown", trigger: "monthly" }));
  });

  it("never starts a second run while one is going", async () => {
    evalLib.evalStatus.mockResolvedValue({ running: "run-0", due: "new-cases", caseCount: 7 });
    const res = await postRun(req({ trigger: "manual" }), params);
    expect(await res.json()).toEqual({ started: false, reason: "running", runId: "run-0" });
  });

  it("passes a candidate's drafting variant to the run, and refuses an unknown one", async () => {
    evalLib.evalStatus.mockResolvedValue({ running: null, due: null, caseCount: 7 });
    evalLib.createEvalRun.mockResolvedValue({ id: "run-2" });
    await postRun(req({ trigger: "candidate", label: "Clean-up pass", variant: "cleanup" }), params);
    await afterFns[0]!();
    expect(evalLib.runEval).toHaveBeenCalledWith("run-2", expect.objectContaining({ trigger: "candidate", variant: "cleanup" }));
    const bad = await postRun(req({ trigger: "candidate", variant: "nope" }), params);
    expect(bad.status).toBe(400);
  });

  it("refuses without the key", async () => {
    const res = await postRun(req({}, "wrong"), params);
    expect(res.status).toBe(401);
  });
});

describe("POST /evals/cases", () => {
  it("returns 422 when Voice has no brief for the piece", async () => {
    evalLib.upsertEvalCase.mockRejectedValue(new evalLib.EvalCaseError("No brief for x"));
    const res = await postCase(req({ sourceId: "x", surfaceId: "blog", finalBody: "Hers." }), params);
    expect(res.status).toBe(422);
  });

  it("rejects a case with no published text", async () => {
    const res = await postCase(req({ sourceId: "x", surfaceId: "blog" }), params);
    expect(res.status).toBe(400);
    expect(evalLib.upsertEvalCase).not.toHaveBeenCalled();
  });
});
