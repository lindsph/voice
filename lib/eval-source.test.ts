import { describe, expect, it } from "vitest";

import { goldFromSource, leaveOutSource } from "./eval-source";

describe("goldFromSource", () => {
  it("matches the titles hosts give golds from a piece", () => {
    expect(goldFromSource("urban-home-garden 10", "urban-home-garden")).toBe(true);
    expect(goldFromSource("urban-home-garden", "urban-home-garden")).toBe(true);
    expect(goldFromSource("Kept in the editor · urban-home-garden", "urban-home-garden")).toBe(true);
  });

  it("does not match another piece whose id starts the same", () => {
    expect(goldFromSource("urban-home-garden-2 4", "urban-home-garden")).toBe(false);
    expect(goldFromSource("Soft CTA (end of how-to)", "urban-home-garden")).toBe(false);
    expect(goldFromSource("anything", "  ")).toBe(false);
  });
});

describe("leaveOutSource", () => {
  const golds = [{ title: "a 1" }, { title: "b 1" }];
  const learnings = [{ sourceDraftId: "a" }, { sourceDraftId: null }, { sourceDraftId: "b" }];

  it("drops only the piece's own golds and rules", () => {
    const out = leaveOutSource(golds, learnings, "a");
    expect(out.golds).toEqual([{ title: "b 1" }]);
    expect(out.learnings).toEqual([{ sourceDraftId: null }, { sourceDraftId: "b" }]);
  });

  it("changes nothing without a piece", () => {
    expect(leaveOutSource(golds, learnings, undefined)).toEqual({ golds, learnings });
  });
});
