import { describe, expect, it } from "vitest";

import { guideExampleParagraphs } from "./guide-examples";

const GUIDE = [
  "## Claims posture (summary)",
  "",
  "> Not an example: this quote is above the section.",
  "",
  "## Example paragraphs (gold tone)",
  "",
  "Approved from Lindsey's votes.",
  "",
  "### Field proof over time",
  "",
  "> Garden wool update — 8 months later.",
  "> Still holding strong.",
  "",
  "*(When you have real dates, use this pattern.)*",
  "",
  "### Soft CTA",
  "",
  "> If you want a starter bag, start small.",
  "",
  "## Ads",
  "",
  "> Not an example either.",
].join("\n");

describe("guideExampleParagraphs", () => {
  it("reads each titled quote in the Example paragraphs section, joining multi-line quotes", () => {
    expect(guideExampleParagraphs(GUIDE)).toEqual([
      { title: "Field proof over time", body: "Garden wool update — 8 months later. Still holding strong." },
      { title: "Soft CTA", body: "If you want a starter bag, start small." },
    ]);
  });

  it("returns nothing for a guide without the section", () => {
    expect(guideExampleParagraphs("## Voice rules\n\n> A quote elsewhere.")).toEqual([]);
  });
});
