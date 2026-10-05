import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftTrace } from "./types";

const create = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  prisma: {
    generationLog: { create, findMany, update },
  },
}));

import {
  countDraftsByGold,
  formatGenerationStamp,
  generationLogData,
  generationLogInput,
  listGenerationLogs,
  logGeneration,
  updateGenerationOutcome,
} from "./generation-log";

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
  retryReason: "banned_phrase:delve",
  selectedGolds: [],
  selectedLearnings: [],
};

const result = {
  body: "Wire planters dry out quickly.",
  bundle: "THE PROMPT",
  retried: true,
  warnings: ["delve"],
  trace,
};

function row(over: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    createdAt: new Date("2026-10-05T13:28:00.000Z"),
    profileId: "woolgrown",
    surfaceId: "blog",
    architecture: "how-to-steps",
    seed: "raised-beds",
    model: "claude-opus-4-6",
    facts: "Raised beds.",
    generatedBody: "Wire planters dry out quickly.",
    selectedGoldIds: ["woolgrown-howto"],
    selectedLearningIds: ["tl-123"],
    warnings: ["delve"],
    retried: true,
    retryReason: "banned_phrase:delve",
    outcome: "pending",
    editedBody: null,
    userNote: null,
    ...over,
  };
}

describe("generation log data", () => {
  it("records the draft that already happened, not the prompt", () => {
    const data = generationLogData(
      generationLogInput({
        profileId: "woolgrown",
        surface: "blog",
        architecture: " how-to-steps ",
        seed: " raised-beds ",
        facts: "Raised beds.",
        result,
      }),
    );
    expect(data).toEqual({
      profileId: "woolgrown",
      surfaceId: "blog",
      architecture: "how-to-steps",
      seed: "raised-beds",
      model: "claude-opus-4-6",
      facts: "Raised beds.",
      generatedBody: "Wire planters dry out quickly.",
      selectedGoldIds: ["woolgrown-howto"],
      selectedLearningIds: ["tl-123"],
      warnings: ["delve"],
      retried: true,
      retryReason: "banned_phrase:delve",
    });
    expect(data).not.toHaveProperty("bundle");
    expect(JSON.stringify(data)).not.toContain("THE PROMPT");
  });

  it("uses the surface as the seed when none was sent", () => {
    const data = generationLogData(
      generationLogInput({
        profileId: "lindsay",
        surface: "first_note",
        facts: "King Street.",
        result: { ...result, retried: false, warnings: [], trace: { ...trace, retryReason: undefined } },
      }),
    );
    expect(data.seed).toBe("first_note");
    expect(data.retryReason).toBeNull();
    expect(data.architecture).toBeNull();
  });
});

describe("logGeneration", () => {
  beforeEach(() => {
    create.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("writes the row after generation", async () => {
    create.mockResolvedValue(row());
    await logGeneration(
      generationLogInput({
        profileId: "woolgrown",
        surface: "blog",
        facts: "Raised beds.",
        result,
      }),
    );
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0].data.generatedBody).toBe("Wire planters dry out quickly.");
  });

  it("still finishes when the database write fails", async () => {
    create.mockRejectedValue(new Error("db down"));
    await expect(
      logGeneration(
        generationLogInput({
          profileId: "woolgrown",
          surface: "blog",
          facts: "Raised beds.",
          result,
        }),
      ),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("generation review", () => {
  beforeEach(() => {
    findMany.mockReset();
    update.mockReset();
  });

  it("counts every draft that used a gold, once per draft", async () => {
    findMany.mockResolvedValue([
      { selectedGoldIds: ["gold-1", "gold-1", "gold-2"] },
      { selectedGoldIds: ["gold-1"] },
      { selectedGoldIds: [] },
    ]);
    await expect(countDraftsByGold("woolgrown")).resolves.toEqual({ "gold-1": 2, "gold-2": 1 });
    expect(findMany).toHaveBeenCalledWith({
      where: { profileId: "woolgrown" },
      select: { selectedGoldIds: true },
    });
  });

  it("lists the newest logs for one profile", async () => {
    findMany.mockResolvedValue([row()]);
    const logs = await listGenerationLogs("woolgrown");
    expect(findMany).toHaveBeenCalledWith({
      where: { profileId: "woolgrown" },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    expect(logs[0]?.outcome).toBe("pending");
    expect(logs[0]?.createdAt).toBe("2026-10-05T13:28:00.000Z");
  });

  it("saves an edit and a short note", async () => {
    update.mockResolvedValue(
      row({
        outcome: "edited",
        editedBody: "Wire planters and hanging baskets dry out fast.",
        userNote: "Too certain about pest benefits.",
      }),
    );
    const saved = await updateGenerationOutcome("log-1", {
      outcome: "edited",
      editedBody: "  Wire planters and hanging baskets dry out fast.  ",
      userNote: "Too certain about pest benefits.",
    });
    expect(saved.outcome).toBe("edited");
    expect(update.mock.calls[0]?.[0].data).toEqual({
      outcome: "edited",
      editedBody: "Wire planters and hanging baskets dry out fast.",
      userNote: "Too certain about pest benefits.",
    });
  });

  it("clears a previous edit when the draft is kept", async () => {
    update.mockResolvedValue(row({ outcome: "kept" }));
    await updateGenerationOutcome("log-1", { outcome: "kept", editedBody: "ignore", userNote: "  " });
    expect(update.mock.calls[0]?.[0].data.editedBody).toBeNull();
    expect(update.mock.calls[0]?.[0].data.userNote).toBeNull();
  });

  it("refuses an edit with no new draft", async () => {
    await expect(updateGenerationOutcome("log-1", { outcome: "edited", editedBody: "  " })).rejects.toThrow(
      /edited draft/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("says when the log is missing", async () => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "test",
      }),
    );
    await expect(updateGenerationOutcome("missing", { outcome: "rejected" })).rejects.toThrow(
      /Unknown generation/,
    );
  });
});

describe("formatGenerationStamp", () => {
  it("formats a local clock time", () => {
    expect(formatGenerationStamp("2026-10-05T13:28:00.000Z", "America/New_York")).toBe(
      "Oct 5, 9:28 AM",
    );
  });
});
