import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftTrace, Gold, Learning, Profile } from "@/lib/types";

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
      reason: "Gold example for this surface.",
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
    expect(screen.getByText("Gold example for this surface.")).toBeInTheDocument();
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

const guide = `# WoolGrown

## Who we sound like

A practical Ontario grower-maker. Knowledgeable about wool.

**Brand signals:**

- Moisture first: less watering, soil that stays damp longer.
- Local: made in Ontario.
`;

const gold: Gold = {
  id: "gold-1",
  profileId: "woolgrown",
  title: "How to",
  body: "Wire planters dry out fast.",
  rejected: "",
  source: "shop blog",
  surface: "blog",
  architecture: "how-to-steps",
  canonical: true,
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const learning: Learning = {
  id: "learn-1",
  profileId: "woolgrown",
  rule: "Do not claim wool pellets kill all slugs",
  status: "active",
  before: "Before.",
  after: "After.",
  why: "Too certain.",
  surface: "blog",
  kind: "fact",
  classificationSource: "heuristic",
  classificationMismatch: false,
  sourceDraftId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ProfileDesk page sections", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the workbench, the voice cards, and an empty teaching list", () => {
    render(
      <ProfileDesk
        profile={{
          ...profile,
          description: "Ontario grower-maker.",
          guide,
          surfaces: [
            { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
            { id: "shop_faq", label: "Shop FAQ", maxWords: 120, hint: "A short answer." },
          ],
        }}
        golds={[gold]}
        learnings={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Drafting Workbench" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Blog" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Shop FAQ" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Restricted Ground Truth Sandbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Strict Truth Filtering ON")).not.toBeInTheDocument();
    expect(screen.queryByText("Ontario cadence score: 98%")).not.toBeInTheDocument();
    expect(screen.queryByText("Single idea rhythm valid")).not.toBeInTheDocument();
    expect(screen.getByText("Cadence: Measured")).toBeInTheDocument();
    expect(screen.getByText("0 chars")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Teach" })).toBeDisabled();

    expect(screen.getByText("Voice guide")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who we sound like." })).toBeInTheDocument();
    expect(screen.getByText('"A practical Ontario grower-maker."').className).not.toMatch(/bg-/);
    expect(screen.queryByText("Master Calibration Document")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Moisture first" })).toBeInTheDocument();
    expect(screen.getByText("less watering, soil that stays damp longer.")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.queryByText("## Who we sound like")).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Golds · Calibration Reference Library" })).toBeInTheDocument();
    expect(screen.getByText("1 gold indexed")).toBeInTheDocument();
    expect(screen.queryByText(/Continuous archival ledger/)).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 indexed")).toBeInTheDocument();
    expect(screen.getByText("Scroll to reveal archive")).toBeInTheDocument();
    expect(screen.getAllByText("How to").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blog").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Wire planters dry out fast\./).length).toBeGreaterThan(0);
    expect(screen.getByText("how-to-steps")).toBeInTheDocument();
    expect(screen.getByText("shop blog")).toBeInTheDocument();
    expect(screen.getAllByText("Used in drafts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not picked yet")).toHaveLength(2);
    expect(screen.getByText("Canonical Text Passage")).toBeInTheDocument();
    expect(screen.getByText("Surface Target:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Used in drafts" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Edit this gold" })).toBeInTheDocument();
    expect(document.querySelector(".golds-scroll")).toBeTruthy();
    expect(screen.getByRole("button", { name: /How to/ })).not.toHaveTextContent("Used in drafts");
    expect(screen.queryByText("100% pass")).not.toBeInTheDocument();
    expect(screen.queryByText("Blog Anchor")).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "What you’ve taught it" })).toBeInTheDocument();
    expect(screen.getByText("0 Active Tuning Heuristics")).toBeInTheDocument();
    expect(screen.getByText("A real edit becomes one preference you can read. Tiny fixes do not teach.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add her writing" })).toBeInTheDocument();
  });

  it("keeps the facts and draft boxes the same height", () => {
    render(<ProfileDesk profile={profile} golds={[]} learnings={[]} />);
    const facts = screen.getByLabelText("Facts");
    const draft = screen.getByLabelText("Draft Output");
    expect(facts).toHaveClass("h-44");
    expect(draft).toHaveClass("h-44");
    expect(facts).not.toHaveAttribute("rows");
    expect(draft).not.toHaveAttribute("rows");
    expect(facts.previousElementSibling).toHaveClass("min-h-8");
    expect(draft.previousElementSibling).toHaveClass("min-h-8");
  });

  it("switches surface, counts facts, teaches, and dismisses a learning", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ learningCount: 1, keptGold: true }),
    } as Response);
    render(
      <ProfileDesk
        profile={{
          ...profile,
          surfaces: [
            { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
            { id: "shop_faq", label: "Shop FAQ", maxWords: 120, hint: "A short answer." },
          ],
        }}
        golds={[]}
        learnings={[learning]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Shop FAQ" }));
    expect(screen.getByRole("button", { name: "Shop FAQ" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Facts"), { target: { value: "wool" } });
    expect(screen.getByText("4 chars")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Draft Output"), { target: { value: "A shorter line." } });
    fireEvent.change(screen.getByLabelText("Why this version is better"), { target: { value: "Too certain." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Keep this whole draft as a gold example." }));
    fireEvent.click(screen.getByRole("button", { name: "Teach" }));

    expect(await screen.findByText("Kept as gold, and the edits will steer the next draft.")).toBeInTheDocument();
    const teachCall = vi.mocked(fetch).mock.calls[0];
    expect(teachCall?.[0]).toBe("/api/profiles/woolgrown/learn");
    expect(JSON.parse(String(teachCall?.[1] && "body" in teachCall[1] ? teachCall[1].body : ""))).toEqual({
      before: "",
      after: "A shorter line.",
      why: "Too certain.",
      keepAsGold: true,
      surface: "shop_faq",
      title: "WoolGrown · shop_faq",
    });

    expect(screen.getByText("1 Active Tuning Heuristic")).toBeInTheDocument();
    expect(screen.getByText("Do not claim wool pellets kill all slugs")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Fact" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe("/api/learnings/learn-1");
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({ method: "PATCH" });
    expect(refresh).toHaveBeenCalled();
  });

  it("uses the block icon for a voice teaching", () => {
    render(
      <ProfileDesk
        profile={profile}
        golds={[]}
        learnings={[{ ...learning, id: "learn-voice", kind: "voice", rule: "Never say miracle fiber." }]}
      />,
    );

    expect(screen.getByRole("img", { name: "Voice" })).toBeInTheDocument();
    expect(screen.getByText("Never say miracle fiber.")).toBeInTheDocument();
  });

  it("filters golds by search and surface", () => {
    render(
      <ProfileDesk
        profile={{
          ...profile,
          surfaces: [
            { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
            { id: "shop_faq", label: "Shop FAQ", maxWords: 120, hint: "A short answer." },
          ],
        }}
        golds={[
          gold,
          {
            ...gold,
            id: "gold-2",
            title: "Soil amending",
            body: "Pellets release nitrogen steadily.",
            surface: "shop_faq",
            architecture: "",
            source: "faq",
            canonical: false,
          },
        ]}
        learnings={[]}
        draftCounts={{ "gold-1": 4, "gold-2": 1 }}
      />,
    );

    expect(screen.getByText("2 golds indexed")).toBeInTheDocument();
    expect(screen.getAllByText("Picked 4 times").length).toBeGreaterThan(0);
    expect(screen.getByText("Picked once")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All (2)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByRole("textbox", { name: "Search golds" }), { target: { value: "nitrogen" } });
    expect(screen.getByText("Showing 1 of 2 indexed")).toBeInTheDocument();
    expect(screen.getAllByText("Soil amending").length).toBeGreaterThan(0);
    expect(screen.queryByText("How to")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search golds" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Show Shop FAQ golds" }));
    expect(screen.getByText("Showing 1 of 2 indexed")).toBeInTheDocument();
    expect(screen.queryByText("How to")).not.toBeInTheDocument();
    expect(screen.getByText("faq")).toBeInTheDocument();
    expect(screen.getAllByText("Picked once").length).toBeGreaterThan(0);
    expect(screen.queryByText("Picked 4 times")).not.toBeInTheDocument();
    expect(screen.getByText("Cadence Pattern:").parentElement).toHaveTextContent("—");
    expect(screen.getByText("Only when it matches")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use in drafts" })).toHaveAttribute("aria-pressed", "false");
  });

  it("turns a gold off for drafts and saves its text, surface, and architecture", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...gold, canonical: false }),
    } as Response);
    render(
      <ProfileDesk
        profile={{
          ...profile,
          surfaces: [
            { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
            { id: "shop_faq", label: "Shop FAQ", maxWords: 120, hint: "A short answer." },
          ],
        }}
        golds={[gold]}
        learnings={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Used in drafts" }));
    expect(await screen.findByRole("button", { name: "Use in drafts" })).toHaveAttribute("aria-pressed", "false");
    const turnOff = vi.mocked(fetch).mock.calls[0];
    expect(turnOff?.[0]).toBe("/api/golds/gold-1");
    expect(JSON.parse(String(turnOff?.[1] && "body" in turnOff[1] ? turnOff[1].body : ""))).toEqual({ canonical: false });
    expect(refresh).toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ...gold,
        canonical: false,
        body: "Line them with fleece.",
        surface: "shop_faq",
        architecture: "faq",
      }),
    } as Response);
    fireEvent.click(screen.getByRole("button", { name: "Edit this gold" }));
    fireEvent.change(screen.getByLabelText("Gold text"), { target: { value: "Line them with fleece." } });
    fireEvent.change(screen.getByLabelText("Surface"), { target: { value: "shop_faq" } });
    fireEvent.change(screen.getByLabelText("Architecture"), { target: { value: "faq" } });
    fireEvent.click(screen.getByRole("button", { name: "Save gold" }));
    expect(await screen.findByRole("button", { name: "Edit this gold" })).toBeInTheDocument();
    expect(screen.getAllByText(/Line them with fleece\./).length).toBeGreaterThan(0);
    expect(screen.getByText("faq")).toBeInTheDocument();
    const save = vi.mocked(fetch).mock.calls[1];
    expect(JSON.parse(String(save?.[1] && "body" in save[1] ? save[1].body : ""))).toEqual({
      body: "Line them with fleece.",
      surface: "shop_faq",
      architecture: "faq",
    });
  });

  it("keeps the gold unchanged when the edit is cancelled or the save fails", async () => {
    render(
      <ProfileDesk
        profile={{
          ...profile,
          surfaces: [
            { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
            { id: "shop_faq", label: "Shop FAQ", maxWords: 120, hint: "A short answer." },
          ],
        }}
        golds={[gold]}
        learnings={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit this gold" }));
    fireEvent.change(screen.getByLabelText("Gold text"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save gold" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Gold text")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Could not update that gold." }),
    } as Response);
    fireEvent.click(screen.getByRole("button", { name: "Used in drafts" }));
    expect(await screen.findByText("Could not update that gold.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Used in drafts" })).toHaveAttribute("aria-pressed", "true");
  });
});
