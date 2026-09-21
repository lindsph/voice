import { describe, expect, it } from "vitest";

import { rulesFromEdit } from "./learn";

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
