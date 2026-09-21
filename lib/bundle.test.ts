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
          profileId: "lindsay",
        },
        {
          id: "b",
          title: "Charise Instagram note",
          body: "Hey",
          surface: "first_note",
          canonical: true,
          profileId: "lindsay",
        },
      ],
      { surface: "first_note", seed: "thatch", profileId: "lindsay" },
    );
    expect(picked.some((item) => item.id === "b")).toBe(true);
  });

  it("includes learnings and banned rules", () => {
    const bundle = formatToneBundle({
      guide: GUIDE,
      bannedForPrompt: ["virtual assistant"],
      profileId: "lindsay",
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
          profileId: "lindsay",
        },
      ],
      learnings: [
        {
          id: "tl-1",
          profileId: "lindsay",
          rule: "Don’t intro yourself.",
          status: "active",
          surface: "first_note",
        },
      ],
    });
    expect(bundle).toMatch(/virtual assistant/);
    expect(bundle).toMatch(/Don’t intro yourself/);
    expect(bundle).toMatch(/do not paraphrase wholesale/i);
    expect(bundle).toMatch(/delve, tapestry/);
    expect(bundle).not.toMatch(/kills all slugs/i);
  });

  it("does not put lindsay identity bans into a woolgrown bundle", () => {
    const bundle = formatToneBundle({
      guide: GUIDE,
      bannedForPrompt: ["guaranteed / guarantee", "delve"],
      profileId: "woolgrown",
      surface: {
        id: "social",
        label: "Social",
        maxWords: 80,
        hint: "A caption.",
      },
      surfaceId: "social",
      seed: "cne",
      golds: [],
      learnings: [],
    });
    expect(bundle).toMatch(/guaranteed/);
    expect(bundle).toMatch(/delve/);
    expect(bundle).not.toMatch(/virtual assistant/i);
    expect(bundle).not.toMatch(/pick your brain/i);
  });

  it("does not put a woolgrown caption rule into a lindsay first note", () => {
    const bundle = formatToneBundle({
      guide: GUIDE,
      bannedForPrompt: [],
      profileId: "lindsay",
      surface: {
        id: "first_note",
        label: "First note",
        maxWords: 120,
        hint: "One observation, then the offer.",
      },
      surfaceId: "first_note",
      seed: "thatch",
      golds: [],
      learnings: [
        {
          id: "wg-social",
          profileId: "woolgrown",
          rule: "Name the fair and the place.",
          status: "active",
          surface: "social",
        },
      ],
    });
    expect(bundle).not.toMatch(/Name the fair/);
  });

  it("does not put a rejected draft into the gold prompt", () => {
    const bundle = formatToneBundle({
      guide: GUIDE,
      bannedForPrompt: [],
      profileId: "lindsay",
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
          id: "ln",
          title: "Charise",
          body: "Hey Charise — random one.",
          surface: "first_note",
          canonical: true,
          profileId: "lindsay",
          rejected: "Let’s delve into your listings and unlock the landscape.",
        },
      ],
      learnings: [],
    });
    expect(bundle).toMatch(/Hey Charise — random one/);
    expect(bundle).not.toMatch(/Do not sound like the rejected/i);
    expect(bundle).not.toMatch(/Let’s delve/);
  });

  it("does not put an old Keep this voice row into the prompt", () => {
    const bundle = formatToneBundle({
      guide: GUIDE,
      bannedForPrompt: [],
      profileId: "lindsay",
      surface: {
        id: "first_note",
        label: "First note",
        maxWords: 120,
        hint: "One observation, then the offer.",
      },
      surfaceId: "first_note",
      seed: "thatch",
      golds: [],
      learnings: [
        {
          id: "tl-keep",
          profileId: "lindsay",
          rule: 'Keep this voice: "Hey Charise — random one."',
          status: "active",
          surface: "first_note",
        },
        {
          id: "tl-real",
          profileId: "lindsay",
          rule: "Don’t introduce yourself when you already know them.",
          status: "active",
          surface: "first_note",
        },
      ],
    });
    expect(bundle).not.toMatch(/Keep this voice/);
    expect(bundle).not.toMatch(/Hey Charise — random one/);
    expect(bundle).toMatch(/Don’t introduce yourself/);
  });
});
