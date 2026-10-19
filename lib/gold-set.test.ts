import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/profiles/[id]/golds/sync/route";
import { planGoldSetSync, type ExistingGold } from "./gold-set";
import { syncGoldSet } from "./store";

vi.mock("./store", async () => {
  const actual = await vi.importActual<typeof import("./store")>("./store");
  return { ...actual, syncGoldSet: vi.fn() };
});

const SOURCE = "Meta ad that met the sales bar (auto)";

function gold(partial: Partial<ExistingGold> & { id: string; body: string }): ExistingGold {
  return { title: "t", source: SOURCE, surface: "ad", status: "active", ...partial };
}

describe("planGoldSetSync", () => {
  it("adds new copy, retitles kept copy, and dismisses copy that fell off the list", () => {
    const plan = planGoldSetSync({
      existing: [
        gold({ id: "a", body: "Winner.", title: "Ad · 300 purchases" }),
        gold({ id: "b", body: "Fell off." }),
      ],
      items: [
        { body: "Winner.", title: "Ad · 392 purchases" },
        { body: "New winner.", title: "Ad · 6 purchases" },
      ],
      source: SOURCE,
      surface: "ad",
    });
    expect(plan.add).toEqual([{ body: "New winner.", title: "Ad · 6 purchases" }]);
    expect(plan.retitle).toEqual([{ id: "a", title: "Ad · 392 purchases" }]);
    expect(plan.dismiss).toEqual(["b"]);
    expect(plan.keep).toBe(1);
  });

  it("never brings back a gold she dismissed, and never touches other sources", () => {
    const plan = planGoldSetSync({
      existing: [
        gold({ id: "hers", body: "Dismissed by her.", status: "dismissed" }),
        gold({ id: "caption", body: "A caption she wrote.", source: "Her writing — captions", surface: "social" }),
        gold({ id: "other-ad", body: "Old ad gold.", source: "WoolGrown Meta ad that led to 1 purchase" }),
      ],
      items: [
        { body: "Dismissed by her.", title: "x" },
        { body: "A caption she wrote.", title: "x" },
      ],
      source: SOURCE,
      surface: "ad",
    });
    expect(plan).toEqual({ add: [], retitle: [], dismiss: [], keep: 0 });
  });

  it("dedupes repeated bodies and dismisses everything for an empty list", () => {
    const repeated = planGoldSetSync({
      existing: [],
      items: [
        { body: " Same. ", title: "1" },
        { body: "Same.", title: "2" },
      ],
      source: SOURCE,
      surface: "ad",
    });
    expect(repeated.add).toEqual([{ body: "Same.", title: "1" }]);
    const empty = planGoldSetSync({ existing: [gold({ id: "a", body: "Winner." })], items: [], source: SOURCE, surface: "ad" });
    expect(empty.dismiss).toEqual(["a"]);
  });
});

describe("POST /api/profiles/:id/golds/sync", () => {
  beforeEach(() => vi.mocked(syncGoldSet).mockReset());

  function request(body: unknown) {
    return new Request("http://127.0.0.1:3030/api/profiles/woolgrown/golds/sync", {
      method: "POST",
      headers: { "content-type": "application/json", host: "127.0.0.1:3030" },
      body: JSON.stringify(body),
    });
  }

  it("syncs the set and returns the counts", async () => {
    vi.mocked(syncGoldSet).mockResolvedValue({ added: 1, kept: 2, retitled: 0, dismissed: 1 });
    const response = await POST(
      request({ surface: "ad", source: SOURCE, items: [{ body: "Winner.", title: "Ad" }] }),
      { params: Promise.resolve({ id: "woolgrown" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 1, kept: 2, retitled: 0, dismissed: 1 });
    expect(syncGoldSet).toHaveBeenCalledWith({
      profileId: "woolgrown",
      surface: "ad",
      source: SOURCE,
      items: [{ body: "Winner.", title: "Ad" }],
    });
  });

  it("refuses a missing or too-short source", async () => {
    const response = await POST(request({ surface: "ad", source: "x", items: [] }), {
      params: Promise.resolve({ id: "woolgrown" }),
    });
    expect(response.status).toBe(400);
    expect(syncGoldSet).not.toHaveBeenCalled();
  });
});
