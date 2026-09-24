import { describe, expect, it } from "vitest";

import {
  inferPreference,
  inferPreferenceHeuristic,
  MIN_TEACH_WORD_EDITS,
  normalizeInferredRule,
  shouldWriteLearning,
  wordEditDistance,
} from "./infer";

describe("shouldWriteLearning", () => {
  it("does not teach a first draft with no why — there is no agent edit to explain", () => {
    expect(
      shouldWriteLearning({
        before: "",
        after: "Hey Charise — random one. Happy to look if useful.",
      }),
    ).toBe(false);
  });

  it("does not teach when the revision barely moved and there is no why", () => {
    expect(
      shouldWriteLearning({
        before: "Hey Charise — random one. Happy to look if useful.",
        after: "Hey Charise — random one. Happy to look if useful!",
      }),
    ).toBe(false);
    expect(
      wordEditDistance(
        "Hey Charise — random one. Happy to look if useful.",
        "Hey Charise — random one. Happy to look if useful!",
      ),
    ).toBeLessThanOrEqual(MIN_TEACH_WORD_EDITS);
  });

  it("teaches when she wrote a why, even on a small edit", () => {
    expect(
      shouldWriteLearning({
        before: "Hello there.",
        after: "Hey there.",
        why: "Don’t open like a stranger.",
      }),
    ).toBe(true);
  });

  it("teaches a real rewrite", () => {
    expect(
      shouldWriteLearning({
        before: "Hey — I’d love to pick your brain about your listings.",
        after: "Hey — random one. Happy to look if useful. No pressure either way.",
      }),
    ).toBe(true);
  });

  it("accepts an explicit rule from another app with no before/after", () => {
    expect(
      shouldWriteLearning({
        existingRule: "Use Canadian spelling.",
      }),
    ).toBe(true);
    expect(
      shouldWriteLearning({
        existingRule: `Prefer "centre" over "center"`,
      }),
    ).toBe(true);
  });
});

describe("inferPreferenceHeuristic", () => {
  it("stores the why as the rule and keeps the snippets as evidence", async () => {
    const learned = inferPreferenceHeuristic({
      before: "Hey — I’d love to pick your brain about your listings.",
      after: "Hey — random one. Happy to look if useful.",
      why: "Don’t open like a stranger pitching a listing fix.",
    });
    expect(learned?.rule).toBe("Don’t open like a stranger pitching a listing fix.");
    expect(learned?.before).toMatch(/pick your brain/);
    expect(learned?.after).toMatch(/random one/);
    expect(learned?.rule).not.toMatch(/Keep this voice/);
  });

  it("does not emit Keep this voice from a from-scratch approve", () => {
    expect(
      inferPreferenceHeuristic({
        before: "",
        after: "Hey Charise — random one. Happy to look if useful.",
      }),
    ).toBeNull();
  });

  it("does not fall back to Prefer-quote when there is no why", () => {
    expect(
      inferPreferenceHeuristic({
        before: "Hey — I’d love to pick your brain about your listings this week.",
        after: "Hey — random one. Happy to look if useful. No pressure either way.",
      }),
    ).toBeNull();
  });

  it("stores an abstract rule from another app and rejects a quoted one", () => {
    expect(
      inferPreferenceHeuristic({
        existingRule: "Use Canadian spelling.",
      })?.rule,
    ).toBe("Use Canadian spelling.");
    expect(
      inferPreferenceHeuristic({
        existingRule: `Prefer "centre" over "center"`,
      }),
    ).toBeNull();
    expect(
      inferPreferenceHeuristic({
        existingRule: 'Avoid: "Wire planters dry out fast." — too salesy for a how-to',
      })?.rule,
    ).toBe("too salesy for a how-to");
    expect(
      inferPreferenceHeuristic({
        existingRule: 'Keep this voice: "Hey — random one." — Open like you already know them',
      })?.rule,
    ).toBe("Open like you already know them");
  });
});

describe("inferPreference", () => {
  it("does not call the model when a why is already the preference", async () => {
    const complete = async () => {
      throw new Error("should not infer over a typed why");
    };
    const learned = await inferPreference(
      {
        before: "Hello there friend I hope this finds you well today.",
        after: "Hey — random one. Happy to look if useful on your side.",
        why: "Don’t open like a stranger.",
      },
      complete,
    );
    expect(learned?.rule).toBe("Don’t open like a stranger.");
  });

  it("uses the inferred sentence and keeps before/after as evidence", async () => {
    const learned = await inferPreference(
      {
        before: "Hey — I’d love to pick your brain about your listings this week.",
        after: "Hey — random one. Happy to look if useful. No pressure either way.",
      },
      async () => "Don’t introduce yourself when you already know them.",
    );
    expect(learned?.rule).toBe("Don’t introduce yourself when you already know them.");
    expect(learned?.before).toMatch(/pick your brain/);
    expect(learned?.after).toMatch(/No pressure/);
  });

  it("writes nothing when the model pastes the after-sentence", async () => {
    const learned = await inferPreference(
      {
        before: "Hey — I’d love to pick your brain about your listings this week.",
        after: "Hey — random one. Happy to look if useful. No pressure either way.",
      },
      async () => 'Keep this voice: "Hey — random one. Happy to look if useful."',
    );
    expect(learned).toBeNull();
  });

  it("writes nothing when the model says the edit was only a fact", async () => {
    const learned = await inferPreference(
      {
        before: "The 350g bag is $24 at the old King Street stall we used last year.",
        after: "The 350g bag is $28 at the new Erb Street stall we booked this month.",
      },
      async () => "NONE",
    );
    expect(learned).toBeNull();
  });
});

describe("normalizeInferredRule", () => {
  it("rejects pasted after-text and snippet rules", () => {
    expect(normalizeInferredRule("NONE")).toBeNull();
    expect(normalizeInferredRule('Keep this voice: "Hey Charise — random one."')).toBeNull();
    expect(
      normalizeInferredRule(
        "Hey — random one. Happy to look if useful.",
        "Hey — random one. Happy to look if useful.",
      ),
    ).toBeNull();
  });
});
