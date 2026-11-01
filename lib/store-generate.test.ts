import { beforeEach, describe, expect, it, vi } from "vitest";

const logGeneration = vi.hoisted(() => vi.fn());
const generateDraft = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const golds = vi.hoisted(() => vi.fn());
const learnings = vi.hoisted(() => vi.fn());
const profileUpdate = vi.hoisted(() => vi.fn());
const goldCreate = vi.hoisted(() => vi.fn((args: unknown) => args));
const transaction = vi.hoisted(() => vi.fn(async (ops: unknown[]) => ops));

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
    profile: { findUnique, update: profileUpdate },
    gold: { findMany: golds, create: goldCreate, update: vi.fn() },
    $transaction: transaction,
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
    logGeneration.mockResolvedValue("gen-1");
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

  it("returns the draft with its log id and logs only after it exists", async () => {
    const result = await generateForProfile({
      profileId: "woolgrown",
      surface: "blog",
      facts: "Raised beds.",
      seed: "raised-beds",
      architecture: "how-to-steps",
      model: "claude-opus-4-6",
    });
    expect(result).toEqual({ ...draft, generationId: "gen-1" });
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
    expect(result).toEqual({ ...draft, generationId: null });
    expect(console.error).toHaveBeenCalled();
  });

  it("writes with the guide the host sent and refreshes the stored copy", async () => {
    profileUpdate.mockReset();
    profileUpdate.mockImplementation(async ({ data }: { data: { guide: string } }) => ({
      id: "woolgrown",
      name: "WoolGrown",
      description: "",
      guide: data.guide,
      systemPrompt: "Write.",
      bannedForPrompt: "[]",
      surfaces: "[]",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    }));
    await generateForProfile({
      profileId: "woolgrown",
      surface: "blog",
      facts: "Raised beds.",
      guide: "## Who we sound like\n\nThe repo guide.",
    });
    expect(generateDraft.mock.calls.at(-1)?.[0].profile.guide).toBe("## Who we sound like\n\nThe repo guide.");
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: "woolgrown" },
      data: { guide: "## Who we sound like\n\nThe repo guide." },
    });
  });

  it("uses the stored guide and leaves it alone when the host sends none or the same one", async () => {
    profileUpdate.mockReset();
    await generateForProfile({ profileId: "woolgrown", surface: "blog", facts: "Raised beds." });
    expect(generateDraft.mock.calls.at(-1)?.[0].profile.guide).toBe("Practical.");
    await generateForProfile({ profileId: "woolgrown", surface: "blog", facts: "Raised beds.", guide: " Practical. " });
    expect(profileUpdate).not.toHaveBeenCalled();
  });
  it("keeps the guide's example paragraphs as blog golds when the host sends a changed guide", async () => {
    profileUpdate.mockReset();
    goldCreate.mockClear();
    findUnique.mockResolvedValue({
      id: "woolgrown",
      name: "WoolGrown",
      description: "",
      guide: "Practical.",
      systemPrompt: "Write.",
      bannedForPrompt: "[]",
      surfaces: JSON.stringify([{ id: "blog", label: "Blog", maxWords: null, hint: "" }]),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    profileUpdate.mockImplementation(async ({ data }: { data: { guide: string } }) => ({
      id: "woolgrown",
      name: "WoolGrown",
      description: "",
      guide: data.guide,
      systemPrompt: "Write.",
      bannedForPrompt: "[]",
      surfaces: "[]",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    }));
    await generateForProfile({
      profileId: "woolgrown",
      surface: "blog",
      facts: "Raised beds.",
      guide: "## Example paragraphs\n\n### Field proof\n\n> Garden wool update — 8 months later.\n",
    });
    expect(goldCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        body: "Garden wool update — 8 months later.",
        title: "Field proof",
        surface: "blog",
        source: "Example paragraph in the tone guide (kept in step)",
      }),
    });
  });
  it("leaves out a piece's own golds and rules for the eval, and does not log the test draft", async () => {
    const at = new Date("2026-10-01T00:00:00.000Z");
    const gold = (id: string, title: string) => ({
      id, profileId: "woolgrown", title, body: `${title} body text here.`, rejected: "", source: "x",
      surface: "blog", architecture: "", canonical: false, status: "active", createdAt: at,
    });
    const rule = (id: string, sourceDraftId: string | null) => ({
      id, profileId: "woolgrown", rule: `Rule ${id}`, status: "active", before: "", after: "", why: "",
      surface: "blog", kind: "voice", classificationSource: "heuristic", classificationMismatch: false,
      sourceDraftId, autoAction: null, autoReason: "", autoTargetId: null, autoAt: null, undoneAt: null,
      createdAt: at, updatedAt: at,
    });
    golds.mockResolvedValue([
      gold("g1", "urban-home-garden 10"),
      gold("g2", "Kept in the editor · urban-home-garden"),
      gold("g3", "what-is-woolgrown 2"),
    ]);
    learnings.mockResolvedValue([rule("r1", "urban-home-garden"), rule("r2", "wool-scraps-getting-a-second-life")]);
    const result = await generateForProfile({
      profileId: "woolgrown",
      surface: "blog",
      facts: "Urban gardens.",
      seed: "urban-home-garden",
      leaveOut: "urban-home-garden",
      log: false,
    });
    const sent = generateDraft.mock.calls.at(-1)?.[0] as { golds: Array<{ id: string }>; learnings: Array<{ id: string }> };
    expect(sent.golds.map((g) => g.id)).toEqual(["g3"]);
    expect(sent.learnings.map((l) => l.id)).toEqual(["r2"]);
    expect(logGeneration).not.toHaveBeenCalled();
    expect(result.generationId).toBeNull();
  });
});
