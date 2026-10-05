import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftTrace, Profile } from "@/lib/types";

import { ProfileDesk } from "./profile-desk";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const profile: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Maker",
  guide: "Practical.",
  systemPrompt: "Write.",
  bannedForPrompt: [],
  surfaces: [{ id: "social", label: "Social", maxWords: 80, hint: "A caption." }],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const trace: DraftTrace = {
  profileId: "woolgrown",
  surfaceId: "social",
  model: "claude-opus-4-6",
  factsCharacterCount: 16,
  selectedGoldIds: ["woolgrown-howto"],
  selectedLearningIds: [],
  bannedPhrasesChecked: ["delve"],
  seed: "social",
  selectedGolds: [
    {
      id: "woolgrown-howto",
      title: "How to",
      reason: "Canonical example for this surface.",
    },
  ],
  selectedLearnings: [],
};

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

describe("ProfileDesk draft trace", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("hides the trace until a draft comes back", () => {
    render(<ProfileDesk profile={profile} golds={[]} learnings={[]} />);
    expect(screen.queryByText("Why this draft?")).not.toBeInTheDocument();
  });

  it("shows the trace from a successful draft", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      body: "Wool in the booth.",
      warnings: [],
      trace,
    }) as Response);
    render(<ProfileDesk profile={profile} golds={[]} learnings={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft this" }));

    expect(await screen.findByText("Why this draft?")).toBeInTheDocument();
    expect(screen.getByText("How to")).toBeInTheDocument();
    expect(screen.getByText("Canonical example for this surface.")).toBeInTheDocument();
    expect(screen.getByText("Model: Claude Opus 4.6")).toBeInTheDocument();
    expect(screen.queryByText(/^Seed:/)).not.toBeInTheDocument();
    expect(screen.getByText("Drafted. Edit it, then teach.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Wool in the booth.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe("/api/profiles/woolgrown/generate");
    expect(JSON.parse(String(call?.[1] && "body" in call[1] ? call[1].body : ""))).toEqual({
      surface: "social",
      facts: "No extra facts.",
    });
  });

  it("keeps the last trace when the next draft fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        body: "Wool in the booth.",
        warnings: ["delve"],
        trace,
      }) as Response)
      .mockResolvedValueOnce(jsonResponse({ error: "Could not draft." }, false) as Response);
    render(<ProfileDesk profile={profile} golds={[]} learnings={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft this" }));
    expect(await screen.findByText(/Still a slop tell after one retry: delve/)).toBeInTheDocument();
    expect(screen.getByText("Warnings: delve")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Draft this" }));
    expect(await screen.findByText("Could not draft.")).toBeInTheDocument();
    expect(screen.getByText("Why this draft?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Wool in the booth.")).toBeInTheDocument();
  });

  it("does not invent a trace when the first draft fails", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "Add a key." }, false) as Response);
    render(<ProfileDesk profile={profile} golds={[]} learnings={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft this" }));
    expect(await screen.findByText("Add a key.")).toBeInTheDocument();
    expect(screen.queryByText("Why this draft?")).not.toBeInTheDocument();
  });
});
