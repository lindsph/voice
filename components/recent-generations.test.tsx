import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationLogRow, Profile } from "@/lib/types";

import { RecentGenerations } from "./recent-generations";

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
  surfaces: [{ id: "blog", label: "Blog", maxWords: null, hint: "A post." }],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const log: GenerationLogRow = {
  id: "log-1",
  createdAt: "2026-10-05T13:28:00.000Z",
  profileId: "woolgrown",
  surfaceId: "blog",
  architecture: "how-to-steps",
  seed: "raised-beds",
  model: "claude-opus-4-6",
  facts: "Raised beds at the booth.",
  generatedBody: "Wire planters dry out quickly.",
  selectedGoldIds: ["woolgrown-howto"],
  selectedLearningIds: ["tl-123"],
  warnings: [],
  retried: false,
  retryReason: null,
  outcome: "pending",
  editedBody: null,
  userNote: null,
};

describe("RecentGenerations", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("says when nothing has been logged", () => {
    render(<RecentGenerations profile={profile} logs={[]} />);
    expect(screen.getByText("WoolGrown — Recent generations")).toBeInTheDocument();
    expect(screen.getByText("No drafts logged yet.")).toBeInTheDocument();
  });

  it("shows the draft, then saves a kept mark with a note", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...log, outcome: "kept" }),
    } as Response);
    render(<RecentGenerations profile={profile} logs={[log]} timeZone="America/New_York" />);
    expect(screen.getByText("Oct 5, 9:28 AM · Blog · how-to-steps · Claude Opus 4.6")).toBeInTheDocument();
    expect(screen.getByText("Outcome: Pending")).toBeInTheDocument();
    expect(screen.getByText("Warnings: none")).toBeInTheDocument();
    expect(screen.getByText("Retried: no")).toBeInTheDocument();
    expect(screen.getByText("Wire planters dry out quickly.")).toBeInTheDocument();
    expect(screen.queryByText("Your edit")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Too certain about pest benefits."), {
      target: { value: "Too certain about pest benefits." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kept" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Kept" })).toBeEnabled());
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe("/api/generations/log-1");
    expect(JSON.parse(String(call?.[1] && "body" in call[1] ? call[1].body : ""))).toEqual({
      outcome: "kept",
      userNote: "Too certain about pest benefits.",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a saved edit and can save another", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...log, outcome: "edited" }),
    } as Response);
    render(
      <RecentGenerations
        profile={profile}
        logs={[
          {
            ...log,
            outcome: "edited",
            editedBody: "Wire planters and hanging baskets dry out fast.",
            retried: true,
            retryReason: "banned_phrase:delve",
            warnings: ["delve"],
          },
        ]}
        timeZone="America/New_York"
      />,
    );
    expect(screen.getByText("Outcome: Edited")).toBeInTheDocument();
    expect(screen.getByText("Warnings: delve")).toBeInTheDocument();
    expect(screen.getByText("Retried: yes · banned phrase “delve”")).toBeInTheDocument();
    expect(screen.getByText("Wire planters and hanging baskets dry out fast.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edited" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your edit" }), {
      target: { value: "A shorter line." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(init && "body" in init ? init.body : ""));
    expect(body).toMatchObject({ outcome: "edited", editedBody: "A shorter line." });
  });
});
