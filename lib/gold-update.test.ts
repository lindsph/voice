import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  prisma: { gold: { update } },
}));

import { updateGold } from "./store";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "gold-1",
    profileId: "woolgrown",
    title: "How to",
    body: "Wire planters dry out fast.",
    rejected: "",
    source: "shop blog",
    surface: "blog",
    architecture: "how-to-steps",
    canonical: true,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  };
}

describe("updateGold", () => {
  beforeEach(() => {
    update.mockReset();
  });

  it("turns a standing example off", async () => {
    update.mockResolvedValue(row({ canonical: false }));
    const saved = await updateGold("gold-1", { canonical: false });
    expect(update).toHaveBeenCalledWith({ where: { id: "gold-1" }, data: { canonical: false } });
    expect(saved.canonical).toBe(false);
  });

  it("saves trimmed text, surface, and architecture", async () => {
    update.mockResolvedValue(row({ body: "Line them with fleece.", surface: "shop_faq", architecture: "faq" }));
    await updateGold("gold-1", { body: "  Line them with fleece.  ", surface: " shop_faq ", architecture: " faq " });
    expect(update).toHaveBeenCalledWith({
      where: { id: "gold-1" },
      data: { body: "Line them with fleece.", surface: "shop_faq", architecture: "faq" },
    });
  });

  it("rejects a blank gold text", async () => {
    await expect(updateGold("gold-1", { body: "   " })).rejects.toThrow("Add the gold text.");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a blank surface", async () => {
    await expect(updateGold("gold-1", { surface: "   " })).rejects.toThrow("Pick a surface.");
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a missing gold", async () => {
    update.mockRejectedValue(new Error("missing"));
    await expect(updateGold("gone", { canonical: true })).rejects.toThrow("Unknown gold: gone");
  });
});
