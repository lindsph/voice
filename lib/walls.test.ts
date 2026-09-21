/**
 * Contract tests. If a later “improvement” mixes mouths, quotes after-text
 * into the prompt, or compact-merges every rule into one pile, these fail.
 * Do not weaken them to make a change pass.
 */
import { describe, expect, it } from "vitest";

import { formatToneBundle } from "./bundle";
import { generateDraft } from "./generate";
import { inferPreference, inferPreferenceHeuristic } from "./infer";
import { isQuotedSnippetRule, rejectedFromApprove } from "./learn";
import { RETRIEVE_LEARNING_K, retrieveGolds, retrieveLearnings } from "./retrieve";
import { slopHits } from "./slop";
import { voiceIntegrationTeaches } from "./teach";
import type { Profile } from "./types";

const GUIDE = `# Lindsay

## Who this sounds like

Warm and direct.

## Voice rules

Name the real offer.

### How sentences open and flow

Short hook.

### Warmth

Friendly.

### Claims

No transformation.

## Gold examples
`;

const lindsay: Profile = {
  id: "lindsay",
  name: "Lindsay",
  description: "",
  guide: GUIDE,
  systemPrompt: "Write.",
  bannedForPrompt: ["virtual assistant / VA as the identity"],
  surfaces: [
    { id: "first_note", label: "First note", maxWords: 120, hint: "A first reach-out." },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const woolgrown: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "",
  guide: GUIDE,
  systemPrompt: "Write.",
  bannedForPrompt: ["guaranteed / guarantee", "kills all slugs"],
  surfaces: [{ id: "social", label: "Social", maxWords: 80, hint: "A caption." }],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("mouths never share a pile", () => {
  it("retrieve drops the other mouth even when the query is a perfect match", () => {
    const picked = retrieveLearnings(
      [
        {
          id: "wg",
          profileId: "woolgrown",
          rule: "Name Charise and the King Street listing.",
          status: "active",
          surface: "first_note",
          before: "Charise King Street listing",
          after: "Charise King Street listing",
        },
        {
          id: "ln",
          profileId: "lindsay",
          rule: "Don’t introduce yourself when you already know them.",
          status: "active",
          surface: "first_note",
        },
      ],
      { profileId: "lindsay", surface: "first_note", query: "Charise King Street listing" },
    );
    expect(picked.map((item) => item.id)).toEqual(["ln"]);
  });

  it("does not adopt a learning that forgot its profileId", () => {
    const picked = retrieveLearnings(
      [
        {
          id: "orphan",
          profileId: "",
          rule: "Name the fair and the place.",
          status: "active",
          surface: "first_note",
        },
      ],
      { profileId: "lindsay", surface: "first_note", query: "fair" },
    );
    expect(picked).toEqual([]);
  });

  it("does not adopt a gold that forgot its profileId", () => {
    expect(
      retrieveGolds(
        [
          {
            id: "orphan",
            title: "Fair",
            body: "Find us at The Ex.",
            surface: "first_note",
            canonical: true,
          },
        ],
        { profileId: "lindsay", surface: "first_note", query: "Ex", seed: "x" },
      ),
    ).toEqual([]);
  });

  it("a lindsay bundle never contains woolgrown caption copy or slug bans", () => {
    const bundle = formatToneBundle({
      guide: GUIDE,
      bannedForPrompt: lindsay.bannedForPrompt,
      profileId: "lindsay",
      surface: lindsay.surfaces[0],
      surfaceId: "first_note",
      seed: "thatch",
      facts: "Charise, King Street",
      golds: [
        {
          id: "wg",
          profileId: "woolgrown",
          title: "About wool",
          body: "Canadian sheep wool. Find us at The Ex.",
          surface: "first_note",
          canonical: true,
        },
        {
          id: "ln",
          profileId: "lindsay",
          title: "Charise",
          body: "Hey Charise — random one.",
          surface: "first_note",
          canonical: true,
        },
      ],
      learnings: [
        {
          id: "wg-social",
          profileId: "woolgrown",
          rule: "Name the fair and the place.",
          status: "active",
          surface: "first_note",
        },
      ],
    });
    expect(bundle).toMatch(/Hey Charise — random one/);
    expect(bundle).toMatch(/virtual assistant/);
    expect(bundle).not.toMatch(/Name the fair/);
    expect(bundle).not.toMatch(/The Ex/);
    expect(bundle).not.toMatch(/kills all slugs/);
    expect(bundle).not.toMatch(/Canadian sheep wool/);
  });

  it("a woolgrown generate retry does not mention lindsay identity bans", async () => {
    let retry = "";
    await generateDraft(
      {
        profile: woolgrown,
        surfaceId: "social",
        facts: "CNE this week.",
        seed: "social",
        golds: [],
        learnings: [],
      },
      async ({ user }) => {
        if (user.includes("Previous draft failed")) {
          retry = user;
          return "Wool in the booth at the CNE this week.";
        }
        return "This guaranteed mulch will transform your beds.";
      },
    );
    expect(retry).toMatch(/guaranteed/i);
    expect(retry).not.toMatch(/virtual assistant/i);
  });
});

describe("learnings stay abstract; rejected drafts stay off the prompt", () => {
  it("never stores Keep this voice or Prefer-quote as the rule", () => {
    expect(
      inferPreferenceHeuristic({
        before: "Hey — I’d love to pick your brain about your listings this week.",
        after: "Hey — random one. Happy to look if useful. No pressure either way.",
      }),
    ).toBeNull();
    expect(
      inferPreferenceHeuristic({
        existingRule: `Prefer "centre" over "center"`,
      }),
    ).toBeNull();
    expect(isQuotedSnippetRule('Keep this voice: "Hey Charise — random one."')).toBe(true);
  });

  it("drops a model that pastes the after-sentence", async () => {
    expect(
      await inferPreference(
        {
          before: "Hey — I’d love to pick your brain about your listings this week.",
          after: "Hey — random one. Happy to look if useful. No pressure either way.",
        },
        async () => 'Keep this voice: "Hey — random one. Happy to look if useful."',
      ),
    ).toBeNull();
  });

  it("does not retrieve quote-rules or inject a rejected gold body", () => {
    const learnings = retrieveLearnings(
      [
        {
          id: "keep",
          profileId: "lindsay",
          rule: 'Keep this voice: "Hey Charise — random one."',
          status: "active",
          surface: "first_note",
        },
      ],
      { profileId: "lindsay", surface: "first_note", query: "Charise" },
    );
    expect(learnings).toEqual([]);

    const bundle = formatToneBundle({
      guide: GUIDE,
      bannedForPrompt: [],
      profileId: "lindsay",
      surface: lindsay.surfaces[0],
      surfaceId: "first_note",
      seed: "thatch",
      golds: [
        {
          id: "ln",
          profileId: "lindsay",
          title: "Charise",
          body: "Hey Charise — random one.",
          surface: "first_note",
          canonical: true,
          rejected: "Let’s delve into your listings and unlock the landscape.",
        },
      ],
      learnings: [],
    });
    expect(bundle).toMatch(/Hey Charise — random one/);
    expect(bundle).not.toMatch(/Let’s delve/);
    expect(bundle).not.toMatch(/Do not sound like the rejected/i);
    expect(
      rejectedFromApprove(
        "Let’s delve into why wool holds water.",
        "Wool holds water without waterlogging roots.",
      ),
    ).toBe("Let’s delve into why wool holds water.");
  });

  it("caps same-surface retrieve at CIPHER-5 and injects nothing across surfaces", () => {
    const pile = Array.from({ length: 8 }, (_, index) => ({
      id: `tl-${index}`,
      profileId: "lindsay",
      rule: `Keep the easy out ${index}.`,
      status: "active" as const,
      surface: "first_note",
    }));
    expect(
      retrieveLearnings(pile, {
        profileId: "lindsay",
        surface: "first_note",
        query: "easy out",
      }),
    ).toHaveLength(RETRIEVE_LEARNING_K);
    expect(
      retrieveLearnings(pile, {
        profileId: "lindsay",
        surface: "follow_up",
        query: "easy out",
      }),
    ).toEqual([]);
  });
});

describe("teach levers and slop stay per integration", () => {
  it("WoolGrown local is silent; lindsay-assistant is not", () => {
    expect(
      voiceIntegrationTeaches({ nodeEnv: "development", defaultMode: "production" }),
    ).toBe(false);
    expect(voiceIntegrationTeaches({ nodeEnv: "production", defaultMode: "production" })).toBe(
      true,
    );
    expect(voiceIntegrationTeaches({ nodeEnv: "development", defaultMode: "always" })).toBe(
      true,
    );
  });

  it("does not punish seeded golds or landscape fabric", () => {
    expect(
      slopHits(
        "Hey Charise — random one. Happy to look if useful — no pressure either way. Automations — the unglamorous stuff.",
        { surfaceId: "first_note", maxWords: 120 },
      ),
    ).toEqual([]);
    expect(
      slopHits("Landscape fabric sheds microplastics. Wool does not.", {
        surfaceId: "social",
        maxWords: 80,
      }),
    ).toEqual([]);
  });
});
