import { describe, expect, it } from "vitest";

import { goldTitleFromPassage, herWritingSource, passagesFromHerWriting } from "./her-writing";

const GUIDE = `
WOOLGROWN
woolgrowncompany@gmail.com | shopwoolgrown.com
100% Natural | Biodegradable | Made in Canada

This guide recommends ways in which to use wool pellets, ranging from raised beds to potted houseplants.
Wool pellets are a natural fibre mulch made from raw Canadian wool.
Wool has the ability to hold moisture, feed soil biology slowly, and improve soil structure over time.

• Mix evenly through the soil when possible. For containers, raised beds and soil blocks, distribute pellets throughout the growing mix rather than concentrating them in one spot.
• Water thoroughly after applying. Wool pellets absorb water and expand as they become hydrated.

2' x 4' Bed
113.3 L
283 g / 0.62 lb
3 1/4 cups
567 g / 1.25 lb

For new potting mixes, use the WoolGrown working recipe of 1/2 cup wool pellets to 4 cups soil.
`;

describe("passages from her writing", () => {
  it("keeps her sentences and drops the masthead and the rate table", () => {
    expect(passagesFromHerWriting(GUIDE)).toEqual([
      "This guide recommends ways in which to use wool pellets, ranging from raised beds to potted houseplants.",
      "Wool pellets are a natural fibre mulch made from raw Canadian wool.",
      "Wool has the ability to hold moisture, feed soil biology slowly, and improve soil structure over time.",
      "Mix evenly through the soil when possible.",
      "For containers, raised beds and soil blocks, distribute pellets throughout the growing mix rather than concentrating them in one spot.",
      "Water thoroughly after applying.",
      "Wool pellets absorb water and expand as they become hydrated.",
      "For new potting mixes, use the WoolGrown working recipe of 1/2 cup wool pellets to 4 cups soil.",
    ]);
  });

  it("drops a heading that got stuck to the sentence", () => {
    expect(
      passagesFromHerWriting(
        "Using Wool Pellets Successfully Expansion Wool pellets swell and separate into fibres when they become wet.\n\n1:8 Mix Ratio Mix 1 part pellets to 8 parts soil.",
      ),
    ).toEqual([]);
  });

  it("names a gold from the opening words and the piece she wrote", () => {
    expect(goldTitleFromPassage("Mix evenly through the soil when possible.")).toBe(
      "Mix evenly through the soil when",
    );
    expect(herWritingSource("Pellet usage guide, 1 Oct 2026")).toBe(
      "Her writing — Pellet usage guide, 1 Oct 2026",
    );
    expect(herWritingSource("  ")).toBe("Her writing");
  });
});
