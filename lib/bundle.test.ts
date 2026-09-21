import { describe, expect, it } from "vitest";

import { extractCompactToneRules, formatToneBundle, selectGoldExamples } from "./bundle";

const GUIDE = `# Lindsay

## Who this sounds like

A software developer with a long ops background.

## Voice rules

Name the real offer.

### How sentences open and flow

Open with a short hook.

### Warmth

Friendly, not bubbly-for-hire.

### Claims

Do not promise transformation.

## Gold examples
`;

describe("tone bundle", () => {
  it("extracts compact standing rules", () => {
    const rules = extractCompactToneRules(GUIDE);
    expect(rules).toMatch(/Who this sounds like/);
    expect(rules).toMatch(/short hook/);
  });

  it("prefers surface-matched golds", () => {
    const picked = selectGoldExamples(
      [
        {
          id: "a",
          title: "About",
          body: "About",
          surface: "other",
          canonical: true,
        },
        {
          id: "b",
          title: "Charise Instagram note",
          body: "Hey",
          surface: "first_note",
          canonical: true,
        },
      ],
      { surface: "first_note", seed: "thatch" },
    );
    expect(picked.some((item) => item.id === "b")).toBe(true);
  });

  it("includes learnings and banned rules", () => {
    const bundle = formatToneBundle({
      guide: GUIDE,
      bannedForPrompt: ["virtual assistant"],
      surface: {
        id: "first_note",
        label: "First note",
        maxWords: 120,
        hint: "One observation, then the offer.",
      },
      surfaceId: "first_note",
      seed: "thatch",
      golds: [
        {
          id: "b",
          title: "Charise Instagram note",
          body: "Hey Charise — random one.",
          surface: "first_note",
          canonical: true,
        },
      ],
      learnings: [{ rule: "Don’t intro yourself.", status: "active" }],
    });
    expect(bundle).toMatch(/virtual assistant/);
    expect(bundle).toMatch(/Don’t intro yourself/);
    expect(bundle).toMatch(/do not paraphrase wholesale/i);
  });
});
