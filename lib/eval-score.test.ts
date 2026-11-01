import { describe, expect, it } from "vitest";

import {
  candidateBeat,
  countedTellsPer1k,
  medianDays,
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
  const draft = (passed: boolean, likeHer: number, kept: number, tells: number, counted = 0) => ({
    passed, judgeCorrect: passed ? 1 : 2, likeHer, keptPercent: kept, tells, countedPer1k: counted, judgeWhy: [], tellsBroken: [], draft: "d",
  });

  it("passes only when the judge did not pick her piece in both orders", () => {
    expect(passedFromJudge(2)).toBe(false);
    expect(passedFromJudge(1)).toBe(true);
    expect(passedFromJudge(0)).toBe(true);
  });

  it("averages over every draft, adds head-to-head and real results, and leaves out cases that errored", () => {
    const out = summarizeEval(
      [
        { sourceId: "a", drafts: [draft(true, 6, 60, 1, 2), draft(false, 4, 40, 2, 4)], herCountedPer1k: 1, headToHead: { wins: 2, ties: 0, losses: 0 } },
        { sourceId: "b", drafts: [draft(false, 5, 50, 0, 0)], herCountedPer1k: 3, headToHead: { wins: 0, ties: 1, losses: 0 } },
        { sourceId: "c", drafts: [], herCountedPer1k: 0, error: "boom" },
      ],
      { cases: 1, keptPercent: 62, medianDaysToLive: 3.5 },
    );
    expect(out).toEqual({
      passes: 1, cases: 2, drafts: 3, likeHer: 5, keptPercent: 50, tellsPerCase: 1, countedPer1k: 2, herCountedPer1k: 2,
      headToHead: { wins: 2, ties: 1, losses: 0 },
      real: { cases: 1, keptPercent: 62, medianDaysToLive: 3.5 },
    });
  });

  it("scores nothing as zeros", () => {
    expect(summarizeEval([])).toMatchObject({ passes: 0, cases: 0, drafts: 0, keptPercent: 0 });
  });
});

describe("countedTellsPer1k / medianDays", () => {
  it("counts em-dashes, it's-not-X-it's-Y and lists of three per 1,000 words", () => {
    expect(countedTellsPer1k("")).toBe(0);
    expect(countedTellsPer1k("Plain words only here, nothing else at all.")).toBe(0);
    expect(countedTellsPer1k("Wool works — really. It's not mulch, it's food.")).toBeGreaterThan(0);
  });

  it("takes the middle of the spans", () => {
    expect(medianDays([])).toBeNull();
    expect(medianDays([5, 1, 3])).toBe(3);
    expect(medianDays([1, 2, 3, 4])).toBe(2.5);
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

  it("compares pass rates over drafts, and flags half a point less on sounds-like-her", () => {
    const now = { ...base, passes: 3, drafts: 21, likeHer: 5 };
    expect(scoresDropped(now, { ...now, likeHer: 4.5 })).toBe(true);
    expect(scoresDropped(now, { ...now, likeHer: 4.8 })).toBe(false);
    expect(scoresDropped(now, { ...now, passes: 2 })).toBe(true);
  });

  it("calls a candidate better on head-to-head wins, kept within 2 points", () => {
    expect(candidateBeat(base, { ...base, keptPercent: 54, headToHead: { wins: 5, ties: 10, losses: 3 } })).toBe(true);
    expect(candidateBeat(base, { ...base, headToHead: { wins: 3, ties: 10, losses: 3 } })).toBe(false);
    expect(candidateBeat(base, { ...base, keptPercent: 50, headToHead: { wins: 9, ties: 0, losses: 0 } })).toBe(false);
  });

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
