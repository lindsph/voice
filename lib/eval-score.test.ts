import { describe, expect, it } from "vitest";

import {
  candidateBeat,
  EVAL_MONTHLY_MS,
  evalDue,
  evalText,
  firstJsonObject,
  firstWords,
  keptPercent,
  passedFromJudge,
  scoresDropped,
  summarizeEval,
  tidy,
  type EvalCaseScore,
} from "./eval-score";

const blog = JSON.stringify({
  title: "Urban Gardening",
  lead: "Wool helps pots.",
  sections: [{ heading: "Mix it in", body: "Mix half a cup per four cups." }],
  faq: [{ question: "Smell?", answer: "No." }],
  cta: "Come say hello.",
});

describe("evalText", () => {
  it("reads a blog draft as lead, section heads and bodies, and close", () => {
    expect(evalText(blog)).toBe("Wool helps pots.\n\nMix it in\n\nMix half a cup per four cups.\n\nCome say hello.");
  });

  it("tidies a plain piece", () => {
    expect(evalText("## Step 1\n\nUse **wool** [here](https://x.y) , today .")).toBe("Step 1\n\nUse wool here, today.");
  });
});

describe("tidy / firstWords", () => {
  it("removes stray spaces before punctuation, an HTML-copy artifact", () => {
    expect(tidy("online shop , shipping")).toBe("online shop, shipping");
  });

  it("cuts to a word count", () => {
    expect(firstWords("one two three four", 2)).toBe("one two");
  });
});

describe("keptPercent", () => {
  it("is the share of draft words still in the published piece", () => {
    expect(keptPercent("wool helps pots grow", "wool helps pots")).toBe(75);
    expect(keptPercent("", "anything")).toBe(0);
  });
});

describe("passedFromJudge / summarizeEval", () => {
  const score = (passed: boolean, kept: number, tells: number, error?: string): EvalCaseScore => ({
    sourceId: "x", passed, judgeCorrect: passed ? 1 : 2, keptPercent: kept, tells, judgeWhy: [], tellsBroken: [], error,
  });

  it("passes only when the judge did not pick her piece in both orders", () => {
    expect(passedFromJudge(2)).toBe(false);
    expect(passedFromJudge(1)).toBe(true);
    expect(passedFromJudge(0)).toBe(true);
  });

  it("averages scored cases and leaves out ones that errored", () => {
    expect(summarizeEval([score(true, 60, 1), score(false, 40, 2), score(false, 0, 0, "boom")])).toEqual({
      passes: 1, cases: 2, keptPercent: 50, tellsPerCase: 1.5,
    });
    expect(summarizeEval([])).toEqual({ passes: 0, cases: 0, keptPercent: 0, tellsPerCase: 0 });
  });
});

describe("evalDue", () => {
  const now = new Date("2026-11-01T00:00:00.000Z");

  it("waits for 3 cases before the first run", () => {
    expect(evalDue({ caseCount: 2, casesSinceLastRun: 2, lastRunAt: null, now })).toBeNull();
    expect(evalDue({ caseCount: 3, casesSinceLastRun: 3, lastRunAt: null, now })).toBe("new-cases");
  });

  it("runs again after 3 new cases, or a month", () => {
    const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(evalDue({ caseCount: 9, casesSinceLastRun: 2, lastRunAt: recent, now })).toBeNull();
    expect(evalDue({ caseCount: 9, casesSinceLastRun: 3, lastRunAt: recent, now })).toBe("new-cases");
    const old = new Date(now.getTime() - EVAL_MONTHLY_MS);
    expect(evalDue({ caseCount: 9, casesSinceLastRun: 0, lastRunAt: old, now })).toBe("monthly");
  });

  it("never runs with no cases", () => {
    expect(evalDue({ caseCount: 0, casesSinceLastRun: 0, lastRunAt: null, now })).toBeNull();
  });
});

describe("scoresDropped / candidateBeat", () => {
  const base = { passes: 3, cases: 7, keptPercent: 55, tellsPerCase: 1 };

  it("flags fewer passes, 5+ points less kept, or half a tell more", () => {
    expect(scoresDropped(base, { ...base, passes: 2 })).toBe(true);
    expect(scoresDropped(base, { ...base, keptPercent: 50 })).toBe(true);
    expect(scoresDropped(base, { ...base, tellsPerCase: 1.5 })).toBe(true);
    expect(scoresDropped(base, { ...base, keptPercent: 52, tellsPerCase: 1.2 })).toBe(false);
    expect(scoresDropped(base, { ...base, passes: 4, cases: 8 })).toBe(false);
  });

  it("calls a candidate better only with more passes and no less kept", () => {
    expect(candidateBeat(base, { ...base, passes: 5 })).toBe(true);
    expect(candidateBeat(base, { ...base, passes: 5, keptPercent: 50 })).toBe(false);
    expect(candidateBeat(base, base)).toBe(false);
  });
});

describe("firstJsonObject", () => {
  it("reads the first object even with text or braces after it", () => {
    expect(firstJsonObject('Sure: {"pick":"A","why":"a } inside"} trailing {x}')).toEqual({ pick: "A", why: "a } inside" });
    expect(() => firstJsonObject("no json")).toThrow();
  });
});
