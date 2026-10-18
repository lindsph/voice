import { beforeEach, describe, expect, it, vi } from "vitest";

const goldFindMany = vi.hoisted(() => vi.fn());
const goldCreate = vi.hoisted(() => vi.fn());
const goldUpdate = vi.hoisted(() => vi.fn());
const learningFindMany = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  prisma: {
    gold: { findMany: goldFindMany, create: goldCreate, update: goldUpdate },
    learning: { findMany: learningFindMany, create: vi.fn() },
  },
}));

import { learnForProfile } from "./store";

const sentence = "In Canada, WoolGrown is available through Lee Valley Tools online and locations where available.";

describe("learnForProfile keeps a dismissed gold dismissed", () => {
  beforeEach(() => {
    goldFindMany.mockReset();
    goldCreate.mockReset();
    goldUpdate.mockReset();
    learningFindMany.mockReset();
    learningFindMany.mockResolvedValue([]);
  });

  it("does not bring back a sentence she dismissed when the weekly sync sends it again", async () => {
    goldFindMany.mockResolvedValue([{ id: "g1", body: sentence, architecture: "", status: "dismissed" }]);
    const result = await learnForProfile({ profileId: "woolgrown", after: sentence, keepAsGold: true, surface: "blog" });
    expect(result.keptGold).toBe(false);
    expect(goldCreate).not.toHaveBeenCalled();
    expect(goldUpdate).not.toHaveBeenCalled();
    expect(goldFindMany.mock.calls[0]?.[0].where).toEqual({ profileId: "woolgrown" });
  });

  it("still keeps a new sentence as a gold", async () => {
    goldFindMany.mockResolvedValue([]);
    const result = await learnForProfile({
      profileId: "woolgrown",
      after: "Pick the bag that suits your beds, then water it in.",
      keepAsGold: true,
      surface: "blog",
    });
    expect(result.keptGold).toBe(true);
    expect(goldCreate).toHaveBeenCalledOnce();
  });
});
