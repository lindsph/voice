import { describe, expect, it, vi } from "vitest";

import type { ChatComplete } from "./generate";
import { buildRuleCheckPrompt, checkNewRule, claimsSections, decideNewRule, parseRuleVerdict } from "./rule-check";

const GUIDE = `# Guide

### How we make claims (voice layer)

- Never absolute claims.

### Being specific

- Name the place.

## Claims posture (summary)

- Slugs: user reports only.

---

## Example paragraphs (gold tone)

Text.`;

const live = [
  { id: "tl-1", rule: "Speak as \"our\" rather than naming the brand." },
  { id: "tl-2", rule: "Open FAQ answers with a direct yes or no." },
];

describe("rule check", () => {
  it("reads only the guide's claims sections", () => {
    const claims = claimsSections(GUIDE);
    expect(claims).toContain("Never absolute claims.");
    expect(claims).toContain("Slugs: user reports only.");
    expect(claims).not.toContain("Name the place.");
    expect(claims).not.toContain("Example paragraphs");
  });

  it("lists live rules by id and the claims policy in the prompt", () => {
    const prompt = buildRuleCheckPrompt({ rule: "Use the brand name.", surface: "shop_faq", live, claims: "Never absolute claims." });
    expect(prompt.user).toContain("- [tl-1] Speak as");
    expect(prompt.user).toContain("Claims policy:\nNever absolute claims.");
    expect(prompt.system).toContain('"verdict":"new"|"duplicate"|"conflict"|"claims"');
  });

  it("accepts a verdict only when it names a live rule", () => {
    expect(parseRuleVerdict('{"verdict":"conflict","ruleId":"tl-1","reason":"Opposite."}', live)).toEqual({
      verdict: "conflict",
      ruleId: "tl-1",
      reason: "Opposite.",
    });
    expect(parseRuleVerdict('{"verdict":"duplicate","ruleId":"tl-9"}', live)).toBeNull();
    expect(parseRuleVerdict('```json\n{"verdict":"claims","reason":"Adds estimates."}\n```', live)).toEqual({
      verdict: "claims",
      reason: "Adds estimates.",
    });
    expect(parseRuleVerdict("not json", live)).toBeNull();
  });

  it("lets the rule go live, as today, when the check fails or is unreadable", async () => {
    const down = vi.fn<ChatComplete>().mockRejectedValue(new Error("down"));
    expect((await checkNewRule({ rule: "x", surface: "shop_faq", live, guide: GUIDE }, down)).verdict).toBe("new");
    const junk = vi.fn<ChatComplete>().mockResolvedValue("sure!");
    expect((await checkNewRule({ rule: "x", surface: "shop_faq", live, guide: GUIDE }, junk)).verdict).toBe("new");
    expect(junk.mock.calls[0]![0].effort).toBe("low");
  });

  it("acts only when both checks agree", async () => {
    const input = { rule: "Use the brand name.", surface: "shop_faq", live, guide: GUIDE };
    const agree = vi.fn<ChatComplete>().mockResolvedValue('{"verdict":"conflict","ruleId":"tl-1","reason":"Opposite."}');
    expect(await decideNewRule(input, agree)).toMatchObject({ verdict: "conflict", ruleId: "tl-1" });
    expect(agree).toHaveBeenCalledTimes(2);
    const split = vi.fn<ChatComplete>()
      .mockResolvedValueOnce('{"verdict":"duplicate","ruleId":"tl-2","reason":"Same."}')
      .mockResolvedValueOnce('{"verdict":"new","reason":"Adds detail."}');
    expect((await decideNewRule(input, split)).verdict).toBe("new");
    const otherRule = vi.fn<ChatComplete>()
      .mockResolvedValueOnce('{"verdict":"conflict","ruleId":"tl-1","reason":"x"}')
      .mockResolvedValueOnce('{"verdict":"conflict","ruleId":"tl-2","reason":"y"}');
    expect((await decideNewRule(input, otherRule)).verdict).toBe("new");
  });
});
