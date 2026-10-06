import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  prisma: {
    profile: { findUnique },
    gold: { findMany, create },
  },
}));

import { addHerWriting } from "./store";

const saved = "Wool pellets are a natural fibre mulch made from raw Canadian wool.";
const fresh = "Water thoroughly after applying the pellets to the bed.";

describe("addHerWriting", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset();
    create.mockReset();
    findUnique.mockResolvedValue({
      id: "woolgrown",
      name: "WoolGrown",
      description: "",
      guide: "",
      systemPrompt: "",
      bannedForPrompt: "[]",
      surfaces: JSON.stringify([{ id: "blog", label: "Blog", maxWords: null, hint: "" }]),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    findMany.mockResolvedValue([{ body: `  ${saved}  ` }]);
    create.mockResolvedValue({ id: "her-woolgrown" });
  });

  it("saves a new sentence as a non-canonical gold and skips duplicates", async () => {
    const result = await addHerWriting({
      profileId: "woolgrown",
      passages: [saved, "   ", saved, fresh],
      sourceTitle: "Pellet usage guide, 1 Oct 2026",
      surface: "blog",
    });

    expect(result).toEqual({ added: 1, skipped: 3 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.stringMatching(/^her-woolgrown-1-/),
        profileId: "woolgrown",
        title: "Water thoroughly after applying the pellets",
        body: fresh,
        rejected: "",
        source: "Her writing — Pellet usage guide, 1 Oct 2026",
        surface: "blog",
        architecture: "",
        canonical: false,
        status: "active",
      }),
    });
  });

  it("refuses a surface the profile does not have", async () => {
    await expect(
      addHerWriting({
        profileId: "woolgrown",
        passages: [fresh],
        sourceTitle: "",
        surface: "social",
      }),
    ).rejects.toThrow("Pick a surface.");
    expect(create).not.toHaveBeenCalled();
  });
});
