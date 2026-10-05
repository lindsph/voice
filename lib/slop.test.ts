import { describe, expect, it } from "vitest";

import { bannedHits, bannedPhrasesChecked, lintDraft, slopHits } from "./slop";

const CHARISE_GOLD =
  "Hey Charise — random one. I’ve started taking on a bit of side work helping small businesses with ops and the technical side: admin, the website, booking, listings, automations — the stuff that sits next to the actual work when you’re also on the floor. Noticed a couple of listings still have you at the King Street address and it made me think you might want a hand with that kind of thing. Happy to look if useful — no pressure either way.";

const WOOLGROWN_ABOUT =
  "Hi! I’m Lindsey, the founder of WoolGrown — a proudly Canadian company turning locally grown wool into natural, biodegradable fabrics and materials for gardening, landscaping and agriculture.";

const LINDSAY_BANNED = [
  "virtual assistant / VA as the identity",
  "I'd love to pick your brain",
];

const WOOLGROWN_BANNED = [
  "guaranteed / guarantee",
  "kills all slugs / pest-proof / weed-proof",
  "delve",
];

describe("slop lint", () => {
  it("lets the Charise first-note gold through", () => {
    expect(
      lintDraft({
        body: CHARISE_GOLD,
        banned: LINDSAY_BANNED,
        surfaceId: "first_note",
        maxWords: 120,
      }),
    ).toEqual([]);
  });

  it("does not treat landscaping or landscape fabric as slop", () => {
    expect(
      slopHits(WOOLGROWN_ABOUT, { surfaceId: "blog", maxWords: null }),
    ).toEqual([]);
    expect(
      slopHits("Landscape fabric sheds microplastics. Wool does not.", {
        surfaceId: "social",
        maxWords: 80,
      }),
    ).toEqual([]);
  });

  it("flags stock lexicon on a word boundary", () => {
    const hits = slopHits("Let’s delve into why wool holds water.", {
      surfaceId: "blog",
      maxWords: null,
    });
    expect(hits).toContain("delve");
  });

  it("flags digital landscape but not a garden landscape mention that is fabric", () => {
    expect(
      slopHits("In the digital landscape of gardening blogs…", {
        surfaceId: "blog",
        maxWords: null,
      }),
    ).toContain("the landscape of / digital landscape");
  });

  it("allows one antithesis and fails two in a short note", () => {
    expect(
      slopHits("It’s not a pitch. It’s a look if useful.", {
        surfaceId: "first_note",
        maxWords: 120,
      }),
    ).toEqual([]);
    expect(
      slopHits(
        "It’s not a pitch, it’s a look. It’s not a menu, it’s one job.",
        { surfaceId: "first_note", maxWords: 120 },
      ),
    ).toContain("it's not X, it's Y (2 times)");
  });

  it("flags a caption tricolon and two in a blog", () => {
    expect(
      slopHits("Wool holds moisture, feeds soil, and skips plastic.", {
        surfaceId: "social",
        maxWords: 80,
      }),
    ).toContain("rule-of-three stack (1)");
    expect(
      slopHits("Tuck wool around the crown, water it in, and leave it.", {
        surfaceId: "blog",
        maxWords: null,
      }),
    ).toEqual([]);
    expect(
      slopHits(
        "Wool holds moisture, feeds soil, and skips plastic. It saves time, cuts waste, and feeds beds.",
        { surfaceId: "blog", maxWords: null },
      ),
    ).toContain("rule-of-three stack (2)");
  });

  it("flags two em dashes in a caption, not three in a first note", () => {
    expect(
      slopHits("CNE this week — wool in the booth — come say hi.", {
        surfaceId: "social",
        maxWords: 80,
      }),
    ).toContain("em-dash density (2 in a short caption)");
    expect(
      slopHits(CHARISE_GOLD, { surfaceId: "first_note", maxWords: 120 }),
    ).toEqual([]);
  });

  it("keeps mouth bans on that mouth only", () => {
    expect(
      bannedHits("I’m a virtual assistant who can help.", LINDSAY_BANNED),
    ).toContain("virtual assistant / VA as the identity");
    expect(bannedHits("I’m a virtual assistant who can help.", WOOLGROWN_BANNED)).toEqual(
      [],
    );
    expect(bannedHits("This guaranteed kills all slugs.", LINDSAY_BANNED)).toEqual([]);
    expect(bannedHits("This guaranteed kills all slugs.", WOOLGROWN_BANNED).length).toBeGreaterThan(
      0,
    );
  });

  it("catches short mouth bans like delve", () => {
    expect(bannedHits("Let’s delve into wool.", WOOLGROWN_BANNED)).toContain("delve");
  });
});

describe("bannedPhrasesChecked", () => {
  it("lists the mouth token plus the shared slop list, once each", () => {
    const phrases = bannedPhrasesChecked(WOOLGROWN_BANNED);
    expect(phrases.slice(0, 3)).toEqual([
      "guaranteed",
      "kills all slugs",
      "delve",
    ]);
    expect(phrases.filter((phrase) => phrase === "delve")).toHaveLength(1);
    expect(phrases).toEqual(
      expect.arrayContaining([
        "tapestry",
        "furthermore",
        "crucial",
        "unlock",
        "leverage",
        "in today's world",
        "the landscape of / digital landscape",
      ]),
    );
  });

  it("drops a mouth token shorter than three characters", () => {
    expect(bannedPhrasesChecked(["ok", "ab / longer"])).not.toContain("ok");
    expect(bannedPhrasesChecked(["ok", "ab / longer"])).not.toContain("ab");
  });
});
