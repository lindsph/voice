import { describe, expect, it } from "vitest";

import { RETRIEVE_TAUGHT_GOLD_K, retrieveGolds, retrieveLearnings } from "./retrieve";

const lindsayNote = {
  id: "tl-note",
  profileId: "lindsay",
  rule: "Don’t introduce yourself when you already know them.",
  status: "active" as const,
  surface: "first_note",
  before: "I’d love to pick your brain about listings.",
  after: "Hey — random one. Happy to look if useful.",
  why: "",
  createdAt: "2026-09-21T10:00:00.000Z",
};

const lindsayFollow = {
  id: "tl-follow",
  profileId: "lindsay",
  rule: "No second intro on a follow-up.",
  status: "active" as const,
  surface: "follow_up",
  before: "",
  after: "",
  why: "",
  createdAt: "2026-09-21T11:00:00.000Z",
};

const woolgrownSocial = {
  id: "tl-fair",
  profileId: "woolgrown",
  rule: "Name the fair and the place.",
  status: "active" as const,
  surface: "social",
  before: "Find us this weekend.",
  after: "Find us at The Ex in Toronto.",
  why: "",
  createdAt: "2026-09-21T12:00:00.000Z",
};

describe("retrieveLearnings", () => {
  it("returns active learnings of every kind", () => {
    const fact = {
      ...lindsayNote,
      id: "tl-fact",
      kind: "fact" as const,
      rule: "Do not claim wool pellets kill all slugs",
      createdAt: "2026-09-21T12:00:00.000Z",
    };
    const voice = {
      ...lindsayNote,
      id: "tl-voice",
      kind: "voice" as const,
      rule: "Do not introduce yourself when you already know them",
      createdAt: "2026-09-21T11:00:00.000Z",
    };
    const unknown = {
      ...lindsayNote,
      id: "tl-unknown",
      kind: "unknown" as const,
      rule: "Remember the booth number.",
      createdAt: "2026-09-21T10:00:00.000Z",
    };
    const picked = retrieveLearnings([fact, voice, unknown], {
      profileId: "lindsay",
      surface: "first_note",
      query: "",
    });
    expect(picked.map((item) => item.id).sort()).toEqual(["tl-fact", "tl-unknown", "tl-voice"]);
  });

  it("never returns another mouth’s rules", () => {
    const picked = retrieveLearnings([lindsayNote, woolgrownSocial], {
      profileId: "lindsay",
      surface: "first_note",
      query: "Charise Instagram listings",
    });
    expect(picked.map((item) => item.id)).toEqual(["tl-note"]);
    expect(picked.every((item) => item.profileId === "lindsay")).toBe(true);
  });

  it("does not leak a follow-up rule into a first note", () => {
    const picked = retrieveLearnings([lindsayNote, lindsayFollow], {
      profileId: "lindsay",
      surface: "first_note",
      query: "listings",
    });
    expect(picked.map((item) => item.id)).toEqual(["tl-note"]);
  });

  it("ranks the closer first-note edit above an unrelated one", () => {
    const other = {
      ...lindsayNote,
      id: "tl-other",
      rule: "Keep the easy out.",
      before: "Let me know your thoughts.",
      after: "No pressure either way.",
      createdAt: "2026-09-21T09:00:00.000Z",
    };
    const picked = retrieveLearnings([other, lindsayNote], {
      profileId: "lindsay",
      surface: "first_note",
      query: "pick your brain listings Charise",
      k: 1,
    });
    expect(picked[0]?.id).toBe("tl-note");
  });

  it("retrieves a dislike note and drops the quoted sentence", () => {
    const avoid = {
      ...lindsayNote,
      id: "tl-avoid",
      rule: 'Avoid: "I would love to pick your brain." — Don’t pitch a listing fix',
    };
    const picked = retrieveLearnings([avoid], {
      profileId: "lindsay",
      surface: "first_note",
      query: "listings",
    });
    expect(picked.map((item) => item.rule)).toEqual(["Don’t pitch a listing fix"]);
  });

  it("retrieves a Keep note and drops the quoted sentence", () => {
    const keep = {
      ...lindsayNote,
      id: "tl-keep-note",
      rule: 'Keep this voice: "Hey — random one." — Open like you already know them',
    };
    const picked = retrieveLearnings([keep], {
      profileId: "lindsay",
      surface: "first_note",
      query: "listings",
    });
    expect(picked.map((item) => item.rule)).toEqual(["Open like you already know them"]);
  });

  it("does not retrieve Keep this voice or Prefer-quote rows", () => {
    const keep = {
      ...lindsayNote,
      id: "tl-keep",
      rule: 'Keep this voice: "Hey Charise — random one."',
    };
    const prefer = {
      ...lindsayNote,
      id: "tl-prefer",
      rule: 'Prefer "Hey — random one" over "Hello there."',
    };
    const picked = retrieveLearnings([keep, prefer, lindsayNote, woolgrownSocial], {
      profileId: "lindsay",
      surface: "first_note",
      query: "Charise listings",
    });
    expect(picked.map((item) => item.id)).toEqual(["tl-note"]);
    expect(
      retrieveLearnings([keep, prefer], {
        profileId: "lindsay",
        surface: "first_note",
        query: "Charise listings",
      }),
    ).toEqual([]);
  });

  it("injects nothing when this surface has no learnings", () => {
    expect(
      retrieveLearnings([woolgrownSocial], {
        profileId: "woolgrown",
        surface: "blog",
        query: "wool pellets moisture",
      }),
    ).toEqual([]);
  });
});

describe("retrieveGolds", () => {
  it("returns only the approved body, never the rejected draft", () => {
    const picked = retrieveGolds(
      [
        {
          id: "ln",
          profileId: "lindsay",
          title: "Charise",
          body: "Hey Charise — random one.",
          surface: "first_note",
          canonical: true,
          status: "active",
        },
      ],
      {
        profileId: "lindsay",
        surface: "first_note",
        query: "Charise",
        seed: "thatch",
      },
    );
    expect(picked).toEqual([
      { id: "ln", title: "Charise", body: "Hey Charise — random one." },
    ]);
    expect(JSON.stringify(picked)).not.toMatch(/delve/);
  });

  it("does not pull a woolgrown blog gold onto a lindsay note", () => {
    const picked = retrieveGolds(
      [
        {
          id: "wg",
          profileId: "woolgrown",
          title: "About wool",
          body: "Canadian sheep wool, made for gardens.",
          surface: "blog",
          canonical: true,
          status: "active",
        },
        {
          id: "ln",
          profileId: "lindsay",
          title: "Charise",
          body: "Hey Charise — random one.",
          surface: "first_note",
          canonical: true,
          status: "active",
        },
      ],
      {
        profileId: "lindsay",
        surface: "first_note",
        query: "Charise Instagram",
        seed: "thatch",
      },
    );
    expect(picked.map((item) => item.id)).toEqual(["ln"]);
  });

  it("does not pull an event gold onto a how-to when architecture is set", () => {
    const picked = retrieveGolds(
      [
        {
          id: "howto",
          profileId: "woolgrown",
          title: "gardening-with-wool-pellets 1",
          body: "Mix or spread the pellets, then water them in.",
          surface: "blog",
          architecture: "how-to-steps",
          canonical: false,
          status: "active",
        },
        {
          id: "ex",
          profileId: "woolgrown",
          title: "woolgrown-is-heading-to-the-ex 1",
          body: "This is a chance to talk directly about how wool pellets work.",
          surface: "blog",
          architecture: "proof-story",
          canonical: false,
          status: "active",
        },
        {
          id: "old",
          profileId: "woolgrown",
          title: "untyped",
          body: "Canadian sheep wool, made for gardens.",
          surface: "blog",
          architecture: "",
          canonical: true,
          status: "active",
        },
        {
          id: "loose",
          profileId: "woolgrown",
          title: "untyped taught",
          body: "Spread wool pellets on the bed and water them.",
          surface: "blog",
          architecture: "",
          canonical: false,
          status: "active",
        },
      ],
      {
        profileId: "woolgrown",
        surface: "blog",
        query: "how to use wool pellets in raised beds",
        seed: "raised",
        architecture: "how-to-steps",
      },
    );
    expect(picked.map((item) => item.id)).toEqual(["old", "howto"]);
  });

  it("uses untyped canonical golds when nothing matches the architecture", () => {
    const picked = retrieveGolds(
      [
        {
          id: "ex",
          profileId: "woolgrown",
          title: "Event",
          body: "See us at the fair.",
          surface: "blog",
          architecture: "proof-story",
          canonical: false,
          status: "active",
        },
        {
          id: "old",
          profileId: "woolgrown",
          title: "How-to",
          body: "Wire planters dry out fast.",
          surface: "blog",
          architecture: "",
          canonical: true,
          status: "active",
        },
      ],
      {
        profileId: "woolgrown",
        surface: "blog",
        query: "how to use wool pellets",
        seed: "pellets",
        architecture: "how-to-steps",
      },
    );
    expect(picked.map((item) => item.id)).toEqual(["old"]);
  });

  it("keeps every canonical gold and adds the three closer taught sentences", () => {
    const picked = retrieveGolds(
      [
        {
          id: "woolgrown-maker",
          profileId: "woolgrown",
          title: "About the maker",
          body: "Hi! I’m Lindsey, the founder of WoolGrown — a proudly Canadian company turning locally grown wool into natural, biodegradable fabrics and materials for gardening, landscaping and agriculture.",
          surface: "blog",
          architecture: "",
          canonical: true,
          status: "active",
        },
        {
          id: "woolgrown-howto",
          profileId: "woolgrown",
          title: "How-to (Why → What → How)",
          body: "Wire planters and hanging baskets dry out fast. Lining them with loose wool holds moisture without waterlogging roots.",
          surface: "blog",
          architecture: "",
          canonical: true,
          status: "active",
        },
        {
          id: "woolgrown-uncertainty",
          profileId: "woolgrown",
          title: "Uncertainty",
          body: "Gardeners often report fewer slug visits on wool mulch or pellets.",
          surface: "blog",
          architecture: "",
          canonical: true,
          status: "active",
        },
        {
          id: "live-fair",
          profileId: "woolgrown",
          title: "Booth note",
          body: "Come say hello beside the sheep.",
          surface: "blog",
          architecture: "",
          canonical: false,
          status: "active",
        },
        {
          id: "live-pellets",
          profileId: "woolgrown",
          title: "how-to-use-wool-pellets 1",
          body: "Spread wool pellets, then water them in so the pellets swell.",
          surface: "blog",
          architecture: "",
          canonical: false,
          status: "active",
        },
        {
          id: "live-water",
          profileId: "woolgrown",
          title: "water the wool",
          body: "Water the wool in after you spread it across the bed.",
          surface: "blog",
          architecture: "",
          canonical: false,
          status: "active",
        },
        {
          id: "live-garden",
          profileId: "woolgrown",
          title: "other bed",
          body: "A garden bed needs a different mix.",
          surface: "blog",
          architecture: "",
          canonical: false,
          status: "active",
        },
      ],
      {
        profileId: "woolgrown",
        surface: "blog",
        query: "how-to-use-wool-pellets",
        seed: "how-to-use-wool-pellets",
        architecture: "how-to-steps",
      },
    );
    expect(picked.map((item) => item.id)).toEqual([
      "woolgrown-howto",
      "woolgrown-maker",
      "woolgrown-uncertainty",
      "live-pellets",
      "live-water",
      "live-fair",
    ]);
    expect(picked.map((item) => item.id)).not.toContain("live-garden");
    expect(RETRIEVE_TAUGHT_GOLD_K).toBe(3);
  });

  it("adds three taught sentences when the query is empty", () => {
    const taught = ["a", "b", "c", "d"].map((id) => ({
      id,
      profileId: "woolgrown",
      title: id,
      body: `Sentence ${id} about the booth.`,
      surface: "blog",
      architecture: "",
      canonical: false,
      status: "active" as const,
    }));
    const picked = retrieveGolds(
      [
        {
          id: "seed",
          profileId: "woolgrown",
          title: "Seed",
          body: "Hi, I’m Lindsey.",
          surface: "blog",
          architecture: "",
          canonical: true,
          status: "active",
        },
        ...taught,
      ],
      {
        profileId: "woolgrown",
        surface: "blog",
        query: "",
        seed: "empty-query",
        architecture: "how-to-steps",
      },
    );
    expect(picked[0]?.id).toBe("seed");
    expect(picked).toHaveLength(1 + RETRIEVE_TAUGHT_GOLD_K);
    expect(picked).toHaveLength(4);
  });
});
