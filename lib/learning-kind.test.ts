import { describe, expect, it } from "vitest";

import { learnInputSchema } from "./types";
import {
  classifyLearningKind,
  resolveLearningKind,
  settleClassification,
} from "./learning-kind";

describe("classifyLearningKind", () => {
  it("marks a claim rule as fact", () => {
    expect(classifyLearningKind("Do not claim wool pellets kill all slugs")).toBe("fact");
  });

  it("marks a tone rule as voice", () => {
    expect(classifyLearningKind("Do not introduce yourself when you already know them")).toBe(
      "voice",
    );
  });

  it("stays unknown when the rule has no clear signal", () => {
    expect(classifyLearningKind("Use Canadian spelling.")).toBe("unknown");
    expect(classifyLearningKind("")).toBe("unknown");
  });
});

describe("resolveLearningKind", () => {
  it("defaults to unknown when classification is unavailable", () => {
    expect(resolveLearningKind(undefined, undefined)).toBe("unknown");
    expect(resolveLearningKind(undefined, "banana")).toBe("unknown");
  });

  it("keeps an explicitly supplied kind", () => {
    expect(resolveLearningKind("fact", "voice")).toBe("fact");
    expect(resolveLearningKind("voice", undefined)).toBe("voice");
    expect(learnInputSchema.parse({ kind: "fact" }).kind).toBe("fact");
    expect(learnInputSchema.parse({}).kind).toBeUndefined();
  });
});

describe("settleClassification", () => {
  it("keeps the inferred rule when the classifier rewrites it", () => {
    const settled = settleClassification({
      expectedRule: "Do not introduce yourself when you already know them.",
      raw: {
        rule: "Avoid introducing yourself to someone you already know.",
        kind: "voice",
      },
      source: "separate_call",
    });
    expect(settled.rule).toBe("Do not introduce yourself when you already know them.");
    expect(settled.kind).toBe("voice");
    expect(settled.classificationMismatch).toBe(true);
  });

  it("drops an invalid kind and still returns the rule", () => {
    const settled = settleClassification({
      expectedRule: "Do not make unsupported pest-control claims.",
      raw: { rule: "Do not make unsupported pest-control claims.", kind: "accuracy" },
      source: "same_call",
    });
    expect(settled.rule).toBe("Do not make unsupported pest-control claims.");
    expect(settled.kind).toBe("unknown");
    expect(settled.classificationSource).toBe("fallback");
  });
});
