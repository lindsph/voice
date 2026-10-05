import { beforeEach, describe, expect, it, vi } from "vitest";

const logGeneration = vi.hoisted(() => vi.fn());
const generateDraft = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const golds = vi.hoisted(() => vi.fn());
const learnings = vi.hoisted(() => vi.fn());

vi.mock("./generation-log", async () => {
  const actual = await vi.importActual<typeof import("./generation-log")>("./generation-log");
  return { ...actual, logGeneration };
});

vi.mock("./generate", async () => {
  const actual = await vi.importActual<typeof import("./generate")>("./generate");
  return { ...actual, generateDraft };
});

vi.mock("./db", () => ({
  prisma: {
    profile: { findUnique },
    gold: { findMany: golds },
    learning: { findMany: learnings },
  },
}));

import { generateForProfile } from "./store";
import type { DraftTrace } from "./types";

const trace: DraftTrace = {
  profileId: "woolgrown",
  surfaceId: "blog",
  model: "claude-opus-4-6",
  factsCharacterCount: 12,
  selectedGoldIds: ["woolgrown-howto"],
  selectedLearningIds: ["tl-123"],
  bannedPhrasesChecked: ["delve"],
  seed: "raised-beds",
  architecture: "how-to-steps",
  selectedGolds: [],
  selectedLearnings: [],
};

const draft = {
  body: "Wire planters dry out quickly.",
  bundle: "THE PROMPT",
  retried: false,
  warnings: [] as string[],
  trace,
};

describe("generateForProfile logging", () => {
  beforeEach(() => {
    logGeneration.mockReset();
    generateDraft.mockReset();
    logGeneration.mockResolvedValue(undefined);
    generateDraft.mockResolvedValue(draft);
    findUnique.mockResolvedValue({
      id: "woolgrown",
      name: "WoolGrown",
      description: "",
      guide: "Practical.",
      systemPrompt: "Write.",
      bannedForPrompt: "[]",
      surfaces: "[]",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    golds.mockResolvedValue([]);
    learnings.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the draft unchanged and logs only after it exists", async () => {
    const result = await generateForProfile({
      profileId: "woolgrown",
      surface: "blog",
      facts: "Raised beds.",
      seed: "raised-beds",
      architecture: "how-to-steps",
      model: "claude-opus-4-6",
    });
    expect(result).toBe(draft);
    expect(generateDraft.mock.invocationCallOrder[0]).toBeLessThan(
      logGeneration.mock.invocationCallOrder[0] ?? 0,
    );
    expect(logGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "woolgrown",
        surfaceId: "blog",
        facts: "Raised beds.",
        generatedBody: "Wire planters dry out quickly.",
        selectedGoldIds: ["woolgrown-howto"],
        selectedLearningIds: ["tl-123"],
      }),
    );
    expect(JSON.stringify(logGeneration.mock.calls[0]?.[0])).not.toContain("THE PROMPT");
  });

  it("still returns the draft when logging throws", async () => {
    logGeneration.mockRejectedValue(new Error("db down"));
    const result = await generateForProfile({
      profileId: "woolgrown",
      surface: "blog",
      facts: "Raised beds.",
    });
    expect(result).toEqual(draft);
    expect(console.error).toHaveBeenCalled();
  });
});
