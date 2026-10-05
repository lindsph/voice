import { describe, expect, it } from "vitest";

import { collectToneSelection, extractCompactToneRules, formatToneBundle, selectGoldExamples } from "./bundle";

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
    expect(rules).toMatch(/Friendly/);
    expect(rules).not.toMatch(/Gold examples/);
  });

  it("stops a WoolGrown warmth slice before banned phrases and gold paragraphs", () => {
    const rules = extractCompactToneRules(`# WoolGrown

## Who we sound like

A practical Ontario maker.

## Voice rules

### Do / Don't (standing)

Lead with the answer.

### How sentences open and flow

Open with a short hook.

### Warmth and emphasis

At most one exclamation mark.

### Calls to action

Soft CTA once near the end.

## Banned / flagged phrases

- delve

## Publish to Shopify (styling)

Do not embed style=.

## Claims posture (summary)

Hedge pest claims.

## Example paragraphs (gold tone)

### How-to

Wire planters and hanging baskets dry out fast.
`);
    expect(rules).toMatch(/At most one exclamation mark/);
    expect(rules).toMatch(/Soft CTA once/);
    expect(rules).toMatch(/Hedge pest claims/);
    expect(rules).not.toMatch(/style=/);
    expect(rules).not.toMatch(/Wire planters/);
    expect(rules.match(/delve/g)).toHaveLength(1);
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
    expect(bundle).not.toMatch(/No gold examples/);
    expect(bundle).not.toMatch(/Gold examples/);
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

  it("says why an untyped gold was used when the post type has no match", () => {
    const selection = collectToneSelection({
      guide: GUIDE,
      bannedForPrompt: ["guaranteed / guarantee"],
      profileId: "woolgrown",
      surface: undefined,
      surfaceId: "blog",
      seed: "raised-beds",
      facts: "Wool pellets in a raised bed.",
      architecture: "how-to-steps",
      golds: [
        {
          id: "untyped",
          profileId: "woolgrown",
          title: "Untyped",
          body: "Spread the pellets, then water.",
          surface: "blog",
          architecture: "",
          canonical: false,
          status: "active",
        },
      ],
      learnings: [],
    });
    expect(selection.golds.map((gold) => gold.id)).toEqual(["untyped"]);
    expect(selection.golds[0]?.reason).toMatch(/No example for this post type/);
    expect(selection.bannedPhrasesChecked).toContain("guaranteed");
  });

  it("explains each way a gold or learning gets into the draft", () => {
    const gold = (
      over: Partial<{
        id: string;
        profileId: string;
        title: string;
        architecture: string;
        canonical: boolean;
        status: "active" | "dismissed";
      }> = {},
    ) => ({
      id: "g",
      profileId: "woolgrown",
      title: "How to",
      body: "Spread the pellets, then water.",
      surface: "blog",
      architecture: "",
      canonical: false,
      status: "active" as const,
      ...over,
    });
    const base = {
      guide: GUIDE,
      bannedForPrompt: [] as string[],
      profileId: "woolgrown",
      surface: undefined,
      surfaceId: "blog",
      learnings: [] as [],
    };

    expect(
      collectToneSelection({
        ...base,
        seed: "beds",
        facts: "raised bed",
        golds: [gold({ canonical: true })],
      }).golds[0]?.reason,
    ).toBe("Canonical example for this surface.");

    expect(
      collectToneSelection({
        ...base,
        seed: "beds",
        facts: "raised bed",
        architecture: "how-to-steps",
        golds: [gold({ architecture: "how-to-steps" })],
      }).golds[0]?.reason,
    ).toBe("Taught example for this post type, closest to these facts.");

    expect(
      collectToneSelection({
        ...base,
        seed: "",
        architecture: "how-to-steps",
        golds: [gold({ architecture: "how-to-steps" })],
      }).golds[0]?.reason,
    ).toBe("Taught example for this post type.");

    expect(
      collectToneSelection({
        ...base,
        seed: "beds",
        facts: "raised bed",
        golds: [gold()],
      }).golds[0]?.reason,
    ).toBe("Taught example, closest to these facts.");

    expect(
      collectToneSelection({
        ...base,
        seed: "",
        golds: [gold()],
      }).golds[0]?.reason,
    ).toBe("Taught example rotated in for this seed.");

    const mixed = collectToneSelection({
      ...base,
      seed: "beds",
      facts: "raised bed",
      golds: [
        gold({ id: "live", canonical: true }),
        gold({ id: "gone", status: "dismissed", canonical: true }),
        gold({ id: "other-mouth", profileId: "lindsay", canonical: true }),
      ],
      learnings: [
        {
          id: "tl-blog",
          profileId: "woolgrown",
          rule: "Name the bed.",
          status: "active",
          surface: "blog",
        },
        {
          id: "tl-off",
          profileId: "woolgrown",
          rule: "Stay on the note.",
          status: "active",
          surface: "first_note",
        },
        {
          id: "tl-dead",
          profileId: "woolgrown",
          rule: "Old rule.",
          status: "dismissed",
          surface: "blog",
        },
        {
          id: "tl-lindsay",
          profileId: "lindsay",
          rule: "Don’t introduce yourself.",
          status: "active",
          surface: "blog",
        },
      ],
    });
    expect(mixed.golds.map((item) => item.id)).toEqual(["live"]);
    expect(mixed.learnings.map((item) => item.id)).toEqual(["tl-blog"]);
    expect(mixed.learnings[0]?.reason).toBe("Same surface, closest to these facts.");

    const quiet = collectToneSelection({
      ...base,
      seed: "",
      learnings: [
        {
          id: "tl-blog",
          profileId: "woolgrown",
          rule: "Name the bed.",
          status: "active",
          surface: "blog",
        },
      ],
      golds: [],
    });
    expect(quiet.learnings[0]?.reason).toBe("Same surface.");

    const bundle = formatToneBundle({
      ...base,
      seed: "beds",
      facts: "raised bed",
      golds: [gold({ id: "live", title: "Kept how-to", canonical: true })],
    });
    expect(bundle).toContain("Kept how-to");
    expect(bundle).not.toContain("booth this weekend");
  });
});
