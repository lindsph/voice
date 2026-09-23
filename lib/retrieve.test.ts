import { describe, expect, it } from "vitest";

import { retrieveGolds, retrieveLearnings } from "./retrieve";

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
      ],
      {
        profileId: "woolgrown",
        surface: "blog",
        query: "how to use wool pellets in raised beds",
        seed: "raised",
        architecture: "how-to-steps",
      },
    );
    expect(picked.map((item) => item.id)).toEqual(["howto"]);
  });
});
