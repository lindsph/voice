import { describe, expect, it } from "vitest";

import { calibrationDocument } from "./calibration-doc";

const GUIDE = `# WoolGrown

## Who we sound like

A practical Ontario grower-maker talking to home gardeners. Knowledgeable about wool and soil.

**Brand signals:**

- Moisture first: less watering, soil that stays damp longer. Extra detail that should not lead.
- Local: 100% Canadian wool, made in Ontario.
- Natural: no plastic, no chemicals, biodegradable.

## Voice rules

### How sentences open and flow

- Open with a short hook.
- Keep sentences conversational.
`;

describe("calibrationDocument", () => {
  it("keeps the identity to one sentence and the signals that follow it", () => {
    expect(calibrationDocument(GUIDE)).toEqual({
      quote: "A practical Ontario grower-maker talking to home gardeners.",
      cards: [
        { title: "Moisture first", body: "less watering, soil that stays damp longer." },
        { title: "Local", body: "100% Canadian wool, made in Ontario." },
        { title: "Natural", body: "no plastic, no chemicals, biodegradable." },
      ],
    });
  });

  it("uses the first sentence of each voice rule when there are no signals", () => {
    const guide = `## Who we sound like\n\nA practical Ontario maker. More after.\n\n## Voice rules\n\n### How sentences open and flow\n\n- Open with a short hook. Then more.\n- Keep sentences conversational.\n`;
    expect(calibrationDocument(guide)).toEqual({
      quote: "A practical Ontario maker.",
      cards: [{ title: "How sentences open and flow", body: "Open with a short hook." }],
    });
  });

  it("falls back to the first sentence when the guide has no headings", () => {
    expect(calibrationDocument("Practical. And more.")).toEqual({ quote: "Practical.", cards: [] });
  });
});
