import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isQuotedSnippetRule, rejectedFromApprove, ruleForPrompt, rulesFromEdit } from "./learn";

describe("isQuotedSnippetRule", () => {
  it("flags the ICL-style quote rules and leaves a real preference", () => {
    expect(isQuotedSnippetRule('Keep this voice: "Hey Charise — random one."')).toBe(true);
    expect(isQuotedSnippetRule('Prefer "centre" over "center"')).toBe(true);
    expect(isQuotedSnippetRule('Avoid phrasing like: "Hope this finds you well"')).toBe(true);
    expect(isQuotedSnippetRule("Don’t introduce yourself when you already know them.")).toBe(
      false,
    );
    expect(isQuotedSnippetRule("Prefer a short hook over a stranger intro.")).toBe(false);
  });

  it("keeps the dislike note and drops the quoted sentence", () => {
    expect(
      ruleForPrompt('Avoid: "Wire planters dry out fast." — too salesy for a how-to'),
    ).toBe("too salesy for a how-to");
    expect(ruleForPrompt('Avoid phrasing like: "Hope this finds you well"')).toBeNull();
    expect(ruleForPrompt('Avoid: "Wire planters dry out fast." — no')).toBeNull();
    expect(
      ruleForPrompt('Keep this voice: "Hey — random one." — Open like you already know them'),
    ).toBe("Open like you already know them");
    expect(ruleForPrompt('Keep this voice: "Hey — random one."')).toBeNull();
    expect(
      ruleForPrompt('Prefer "Find us at The Ex" over "Find us this weekend" — Name the fair and the place'),
    ).toBe("Name the fair and the place");
    expect(ruleForPrompt('Prefer "centre" over "center"')).toBeNull();
  });
});

describe("rejectedFromApprove", () => {
  it("keeps the raw generate next to the rewrite and skips a no-op", () => {
    expect(
      rejectedFromApprove(
        "Let’s delve into why wool holds water.",
        "Wool holds water without waterlogging roots.",
      ),
    ).toBe("Let’s delve into why wool holds water.");
    expect(
      rejectedFromApprove(
        "Wool holds water without waterlogging roots.",
        "Wool holds water without waterlogging roots.",
      ),
    ).toBe("");
  });
});

describe("rulesFromEdit", () => {
  it("keeps the opening line from a first draft", () => {
    const rules = rulesFromEdit({
      before: "",
      after: "Hey Charise — random one. Happy to look if useful.",
    });
    expect(rules[0]?.rule).toContain("Keep this voice");
  });

  it("stores an editor note", () => {
    const rules = rulesFromEdit({
      before: "Hello there.",
      after: "Hey — random one.",
      why: "Don’t open like a stranger.",
    });
    expect(rules.some((item) => item.rule.startsWith("Editor note:"))).toBe(true);
  });
});

describe("a kept rewrite is a taught sentence", () => {
  it("stores keepAsGold as non-canonical", () => {
    const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    expect(source).toMatch(/if \(input\.keepAsGold && after\)/);
    expect(source).toMatch(/canonical: false/);
  });
});
