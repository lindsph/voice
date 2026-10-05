import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DraftTrace, Profile } from "@/lib/types";

import { DraftTracePanel, modelLabel, retryLabel } from "./draft-trace";

const profile: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Maker",
  guide: "Practical.",
  systemPrompt: "Write.",
  bannedForPrompt: ["guaranteed / guarantee"],
  surfaces: [
    { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
    { id: "social", label: "Social", maxWords: 80, hint: "A caption." },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function trace(over: Partial<DraftTrace> = {}): DraftTrace {
  return {
    profileId: "woolgrown",
    surfaceId: "blog",
    model: "claude-opus-4-6",
    factsCharacterCount: 812,
    selectedGoldIds: ["woolgrown-howto", "woolgrown-uncertainty"],
    selectedLearningIds: ["tl-123", "tl-128", "tl-130"],
    bannedPhrasesChecked: ["guaranteed", "delve"],
    seed: "raised-beds",
    architecture: "how-to-steps",
    retryReason: "banned_phrase:delve",
    selectedGolds: [
      {
        id: "woolgrown-howto",
        title: "How to",
        reason: "Gold example for this surface.",
      },
      {
        id: "woolgrown-uncertainty",
        title: "Uncertainty",
        reason: "Taught example, closest to these facts.",
      },
    ],
    selectedLearnings: [
      { id: "tl-123", rule: "Name the bed.", reason: "Same surface, closest to these facts." },
      { id: "tl-128", rule: "Skip the slogan.", reason: "Same surface, closest to these facts." },
      { id: "tl-130", rule: "One soft close.", reason: "Same surface, closest to these facts." },
    ],
    ...over,
  };
}

function panel(over: Partial<DraftTrace> = {}, warnings: string[] = []) {
  return render(<DraftTracePanel trace={trace(over)} profile={profile} warnings={warnings} />);
}

describe("modelLabel", () => {
  it("names Claude and GPT models in plain words", () => {
    expect(modelLabel("claude-opus-4-6")).toBe("Claude Opus 4.6");
    expect(modelLabel("claude-sonnet-4-6")).toBe("Claude Sonnet 4.6");
    expect(modelLabel(" GPT-4o ")).toBe("GPT-4o");
    expect(modelLabel("custom-model")).toBe("custom-model");
  });
});

describe("retryLabel", () => {
  it("turns a ban code into a phrase and leaves a shape miss alone", () => {
    expect(retryLabel("banned_phrase:delve")).toBe("banned phrase “delve”");
    expect(
      retryLabel("banned_phrase:guaranteed; lead must be an answer-first paragraph"),
    ).toBe("banned phrase “guaranteed”; lead must be an answer-first paragraph");
  });
});

describe("DraftTracePanel", () => {
  it("stays closed and lists what influenced the draft", () => {
    panel({}, ["delve"]);
    const why = screen.getByText("Why this draft?").closest("details");
    expect(why).not.toBeNull();
    expect(why).toHaveAttribute("open");
    const view = within(why!);
    expect(view.getByText("WoolGrown · Blog")).toBeInTheDocument();
    expect(view.getByText("Facts: 812 characters")).toBeInTheDocument();
    expect(view.getByText("Seed: raised-beds")).toBeInTheDocument();
    expect(view.getByText("Architecture: how-to-steps")).toBeInTheDocument();
    expect(view.getByText("Used 2 gold examples")).toBeInTheDocument();
    expect(view.getByText("Applied 3 learning rules")).toBeInTheDocument();
    expect(view.getByText("Checked 2 banned phrases")).toBeInTheDocument();
    expect(view.getByText("Model: Claude Opus 4.6")).toBeInTheDocument();
    expect(view.getByText("Retry: banned phrase “delve”")).toBeInTheDocument();
    expect(view.getByText("Warnings: delve")).toBeInTheDocument();
    expect(view.getByText("How to")).toBeInTheDocument();
    expect(view.getByText("Gold example for this surface.")).toBeInTheDocument();
    expect(view.getByText("Name the bed.")).toBeInTheDocument();
    expect(view.getByText("guaranteed")).toBeInTheDocument();
  });

  it("uses singular labels and hides seed, architecture, retry, and warnings when they add nothing", () => {
    panel({
      surfaceId: "missing",
      seed: "missing",
      architecture: undefined,
      retryReason: undefined,
      model: "gpt-4o",
      factsCharacterCount: 1,
      selectedGoldIds: [],
      selectedLearningIds: ["tl-1"],
      bannedPhrasesChecked: ["delve"],
      selectedGolds: [],
      selectedLearnings: [
        { id: "tl-1", rule: "Name the bed.", reason: "Same surface." },
      ],
    });
    expect(screen.getByText("WoolGrown · missing")).toBeInTheDocument();
    expect(screen.getByText("Facts: 1 character")).toBeInTheDocument();
    expect(screen.queryByText(/^Seed:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Architecture:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Retry:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Warnings:/)).not.toBeInTheDocument();
    expect(screen.getByText("Used 0 gold examples")).toBeInTheDocument();
    expect(screen.getByText("Applied 1 learning rule")).toBeInTheDocument();
    expect(screen.getByText("Checked 1 banned phrase")).toBeInTheDocument();
    expect(screen.getByText("Model: GPT-4o")).toBeInTheDocument();
    const goldLine = screen.getByText("Used 0 gold examples");
    expect(goldLine.closest("summary")).toBeNull();
    expect(screen.getByText("Applied 1 learning rule").closest("summary")).not.toBeNull();
  });
});
