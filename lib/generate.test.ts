import { describe, expect, it } from "vitest";

import { generateDraft } from "./generate";
import type { Profile } from "./types";

const lindsay: Profile = {
  id: "lindsay",
  name: "Lindsay",
  description: "Side work",
  guide: "Warm and direct.",
  systemPrompt: "Write like Lindsay.",
  bannedForPrompt: ["virtual assistant / VA as the identity"],
  surfaces: [
    {
      id: "first_note",
      label: "First note",
      maxWords: 120,
      hint: "One observation, then the offer.",
    },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const woolgrown: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Maker",
  guide: "Practical Ontario maker.",
  systemPrompt: "Write like WoolGrown.",
  bannedForPrompt: ["guaranteed / guarantee", "delve"],
  surfaces: [
    {
      id: "social",
      label: "Social",
      maxWords: 80,
      hint: "A caption.",
    },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function draftInput(profile: Profile, surfaceId: string) {
  return {
    profile,
    surfaceId,
    facts: "CNE this week.",
    seed: surfaceId,
    golds: [] as [],
    learnings: [] as [],
  };
}

describe("generateDraft slop retry", () => {
  it("does not retry a clean draft", async () => {
    const result = await generateDraft(draftInput(lindsay, "first_note"), async () => {
      return "Hey — noticed the King Street listing. Happy to look if useful.";
    });
    expect(result.retried).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("retries once when the first draft uses stock slop", async () => {
    let calls = 0;
    const result = await generateDraft(draftInput(lindsay, "first_note"), async () => {
      calls += 1;
      return calls === 1
        ? "Let’s delve into the messy admin."
        : "Noticed the King Street listing. Happy to look if useful.";
    });
    expect(calls).toBe(2);
    expect(result.retried).toBe(true);
    expect(result.body).toMatch(/King Street/);
    expect(result.warnings).toEqual([]);
  });

  it("returns the retry plus warnings if it is still sloppy", async () => {
    const result = await generateDraft(draftInput(lindsay, "first_note"), async () => {
      return "Let’s delve into the messy admin.";
    });
    expect(result.retried).toBe(true);
    expect(result.warnings).toContain("delve");
    expect(result.body).toMatch(/delve/);
  });

  it("retries woolgrown mouth bans without using lindsay identity bans", async () => {
    let retryContext = "";
    const result = await generateDraft(draftInput(woolgrown, "social"), async ({ user }) => {
      if (user.includes("Previous draft failed")) {
        retryContext = user;
        return "Wool in the booth at the CNE this week.";
      }
      return "This guaranteed mulch will transform your beds.";
    });
    expect(result.retried).toBe(true);
    expect(retryContext).toMatch(/guaranteed/i);
    expect(retryContext).not.toMatch(/virtual assistant/i);
    expect(result.warnings).toEqual([]);
  });
});
