import { describe, expect, it } from "vitest";

import { isQuotedSnippetRule, rejectedFromApprove, rulesFromEdit } from "./learn";

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
