import { describe, expect, it, vi } from "vitest";

import { buildAnglePrompt, craftPromptBlock, parseAngles, pickAngle } from "./crafted";
import {
  anthropicDraftBody,
  buildUserPrompt,
  craftedApplies,
  generateDraft,
  type ChatComplete,
} from "./generate";
import { generationLogData, generationLogInput } from "./generation-log";
import { retrieveGolds } from "./retrieve";
import { slopHits } from "./slop";
import type { Profile } from "./types";

const woolgrown: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Maker",
  guide: "Practical Ontario maker.",
  systemPrompt: "Write like WoolGrown.",
  bannedForPrompt: ["guaranteed / guarantee"],
  surfaces: [
    { id: "social", label: "Social", maxWords: 80, hint: "A caption." },
    { id: "blog", label: "Blog", maxWords: null, hint: "Shop blog draft." },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const base = {
  profile: woolgrown,
  surfaceId: "social",
  facts: "Wool pellets hold moisture in raised beds.",
  seed: "seed-a",
  golds: [],
  learnings: [],
};

const ANGLES = JSON.stringify({
  angles: ["A raised bed on a dry August evening.", "Why do beds dry out so fast?", "The maker's view."],
});

describe("angles", () => {
  it("reads three angles from JSON and ignores anything else", () => {
    expect(parseAngles(ANGLES)).toHaveLength(3);
    expect(parseAngles("not json")).toEqual([]);
    expect(parseAngles(JSON.stringify({ angles: ["", 4, "One way in."] }))).toEqual(["One way in."]);
  });

  it("picks the same angle for the same seed", () => {
    const angles = parseAngles(ANGLES);
    expect(pickAngle(angles, "seed-a")).toBe(pickAngle(angles, "seed-a"));
    expect(pickAngle([], "seed-a")).toBeUndefined();
  });

  it("tells the angle call not to add claims, and trims long facts", () => {
    const prompt = buildAnglePrompt({ profileName: "WoolGrown", facts: "x".repeat(7000) });
    expect(prompt.system).toMatch(/may not add a result, number, study, or claim/);
    expect(prompt.user.length).toBeLessThan(6100);
  });
});

describe("crafted prompt", () => {
  it("leaves the plain prompt exactly as it was", () => {
    const none = buildUserPrompt(base);
    expect(buildUserPrompt({ ...base, style: "plain" })).toBe(none);
    expect(none).not.toContain("Craft (");
  });

  it("adds the craft block and angle to a crafted whole piece", () => {
    const prompt = buildUserPrompt({ ...base, style: "crafted", angle: "A dry August evening." });
    expect(prompt).toContain(craftPromptBlock("A dry August evening."));
    expect(prompt).toContain("assert nothing new");
  });

  it("keeps passage edits and Shopify fields plain", () => {
    expect(craftedApplies({ style: "crafted", format: "plain" })).toBe(false);
    expect(craftedApplies({ style: "crafted", task: "shopify_headline" })).toBe(false);
    const passage = buildUserPrompt({ ...base, style: "crafted", format: "plain" });
    expect(passage).toBe(buildUserPrompt({ ...base, format: "plain" }));
  });
});

describe("crafted generate", () => {
  it("plans an angle at low effort, then drafts with it", async () => {
    const complete = vi.fn<ChatComplete>()
      .mockResolvedValueOnce(ANGLES)
      .mockResolvedValueOnce("Water less this August. Wool keeps the bed damp.");
    const result = await generateDraft({ ...base, style: "crafted" }, complete);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]![0].effort).toBe("low");
    const angle = pickAngle(parseAngles(ANGLES), base.seed)!;
    expect(complete.mock.calls[1]![0].user).toContain(`Angle: ${angle}`);
    expect(result.trace.style).toBe("crafted");
    expect(result.trace.angle).toBe(angle);
  });

  it("still drafts when the angle call fails", async () => {
    const complete = vi.fn<ChatComplete>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce("Water less this August.");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await generateDraft({ ...base, style: "crafted" }, complete);
    spy.mockRestore();
    expect(result.body).toBe("Water less this August.");
    expect(complete.mock.calls[1]![0].user).toContain("Craft (");
    expect(result.trace.angle).toBeUndefined();
  });

  it("makes one call and no trace style for a plain draft", async () => {
    const complete = vi.fn<ChatComplete>().mockResolvedValue("Water less this August.");
    const result = await generateDraft(base, complete);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]![0].effort).toBeUndefined();
    expect(result.trace.style).toBeUndefined();
  });

  it("sends the effort it is given to Claude", () => {
    const body = anthropicDraftBody({ system: "s", user: "u", model: "claude-opus-5-5", effort: "high" });
    expect(body.output_config).toEqual({ effort: "high" });
    expect(anthropicDraftBody({ system: "s", user: "u", model: "claude-opus-5-5" }).output_config).toEqual({
      effort: "medium",
    });
  });
});

describe("crafted gold rotation", () => {
  const golds = Array.from({ length: 8 }, (_, index) => ({
    id: `g${index}`,
    profileId: "woolgrown",
    status: "active" as const,
    surface: "social",
    canonical: false,
    title: `Gold ${index}`,
    body: `wool pellets raised beds moisture line ${index}`,
  }));
  const options = { profileId: "woolgrown", surface: "social", query: "wool pellets raised beds" };

  it("always takes the same golds for plain drafts", () => {
    const a = retrieveGolds(golds, { ...options, seed: "one" }).map((item) => item.id);
    const b = retrieveGolds(golds, { ...options, seed: "two" }).map((item) => item.id);
    expect(a).toEqual(b);
  });

  it("rotates through the closest golds by seed for crafted drafts", () => {
    const top = new Set(golds.slice(0, 4).map((item) => item.id));
    const picks = ["one", "two", "three", "four", "five"].map((seed) =>
      retrieveGolds(golds, { ...options, seed, rotate: true }).map((item) => item.id).join(","),
    );
    expect(new Set(picks).size).toBeGreaterThan(1);
    for (const pick of picks) {
      for (const id of pick.split(",")) expect(top.has(id)).toBe(true);
    }
  });
});

describe("crafted lint and log", () => {
  const caption = "Spread it, water it in, and let it work.";

  it("lets a crafted caption keep one list of three", () => {
    expect(slopHits(caption, { surfaceId: "social" })).toContain("rule-of-three stack (1)");
    expect(slopHits(caption, { surfaceId: "social", crafted: true })).toEqual([]);
  });

  it("logs style and angle only for crafted drafts", () => {
    const trace = {
      profileId: "woolgrown",
      surfaceId: "social",
      model: "claude-opus-5-5",
      factsCharacterCount: 10,
      selectedGoldIds: [],
      selectedLearningIds: [],
      bannedPhrasesChecked: [],
      seed: "s",
      selectedGolds: [],
      selectedLearnings: [],
    };
    const row = (extra: object) =>
      generationLogData(
        generationLogInput({
          profileId: "woolgrown",
          surface: "social",
          facts: "f",
          result: { body: "b", retried: false, warnings: [], trace: { ...trace, ...extra } },
        }),
      );
    expect(row({})).not.toHaveProperty("style");
    expect(row({ style: "crafted", angle: "A dry evening." })).toMatchObject({
      style: "crafted",
      angle: "A dry evening.",
    });
  });
});
