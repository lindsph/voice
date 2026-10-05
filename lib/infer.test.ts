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
    expect(learned?.kind).toBe("voice");
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
        existingRule: "Use Canadian spelling.",
      })?.kind,
    ).toBe("unknown");
    expect(
      inferPreferenceHeuristic({
        existingRule: "Do not claim wool pellets kill all slugs",
      })?.kind,
    ).toBe("fact");
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
    expect(learned?.kind).toBe("unknown");
    expect(learned?.classificationSource).toBe("fallback");
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

  it("keeps a kind returned beside the inferred rule", async () => {
    let system = "";
    const learned = await inferPreference(
      {
        before: "Wool pellets kill every slug in the bed.",
        after: "Wool pellets are a slug deterrent. They do not kill every slug.",
      },
      async (input) => {
        system = input.system;
        return JSON.stringify({
          rule: "Do not claim wool pellets kill all slugs",
          kind: "fact",
        });
      },
    );
    expect(learned?.rule).toBe("Do not claim wool pellets kill all slugs");
    expect(learned?.kind).toBe("fact");
    expect(learned?.classificationMismatch).toBe(false);
    expect(system).not.toMatch(/Tone rules \(always follow\)/);
    expect(system).not.toMatch(/Classify this learning rule/);
  });

  it("preserves the exact inferred rule even if the classifier returns different text", async () => {
    const expectedRule = "Do not introduce yourself when you already know them.";
    const learned = await inferPreference(
      {
        before: "Hi, I would love to pick your brain about your listings.",
        after: "Hey, happy to look if useful.",
      },
      async (input) => {
        if (input.system.startsWith("Classify this learning rule.")) {
          return JSON.stringify({
            rule: "Avoid introducing yourself to someone you already know.",
            kind: "voice",
          });
        }
        return expectedRule;
      },
    );
    expect(learned?.rule).toBe(expectedRule);
    expect(learned?.kind).toBe("voice");
    expect(learned?.classificationMismatch).toBe(true);
    expect(learned?.classificationSource).toBe("separate_call");
  });

  it("falls back to unknown when kind is invalid", async () => {
    const learned = await inferPreference(
      {
        before: "This guaranteed mulch will transform your beds.",
        after: "Gardeners often report fewer slug visits; controlled studies are still thin.",
      },
      async () =>
        JSON.stringify({
          rule: "Do not make unsupported pest-control claims.",
          kind: "accuracy",
        }),
    );
    expect(learned?.rule).toBe("Do not make unsupported pest-control claims.");
    expect(learned?.kind).toBe("unknown");
  });

  it("defaults to unknown when kind is missing", async () => {
    const learned = await inferPreference({
      rule: "Keep the easy out.",
      complete: async () => JSON.stringify({ rule: "Keep the easy out." }),
    });
    expect(learned?.rule).toBe("Keep the easy out.");
    expect(learned?.kind).toBe("unknown");
  });

  it("still saves the learning with unknown kind when classification fails", async () => {
    const learned = await inferPreference(
      {
        before: "Hey — I’d love to pick your brain about your listings this week.",
        after: "Hey — random one. Happy to look if useful. No pressure either way.",
      },
      async (input) => {
        if (input.system.startsWith("Classify this learning rule.")) {
          throw new Error("classifier unavailable");
        }
        return "Keep the easy out.";
      },
    );
    expect(learned?.rule).toBe("Keep the easy out.");
    expect(learned?.kind).toBe("unknown");
    expect(learned?.classificationSource).toBe("fallback");
  });

  it("defaults kind to unknown when the model kind is unusable", async () => {
    const learned = await inferPreference(
      {
        before: "Wool pellets kill every slug in the bed.",
        after: "Wool pellets are a slug deterrent. They do not kill every slug.",
      },
      async () => JSON.stringify({ rule: "Remember the booth number.", kind: "maybe" }),
    );
    expect(learned?.rule).toBe("Remember the booth number.");
    expect(learned?.kind).toBe("unknown");
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
