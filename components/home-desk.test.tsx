import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildHealthReport, type HealthLog } from "@/lib/health";
import type { Profile } from "@/lib/types";

import { HomeDesk } from "./home-desk";

const woolgrown: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Ontario grower-maker. Garden wool. Humble about unproven claims.",
  guide: "Practical.",
  systemPrompt: "Write.",
  bannedForPrompt: [],
  surfaces: [
    { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
    { id: "shop_faq", label: "Shop FAQ", maxWords: 120, hint: "A short answer." },
    { id: "social", label: "Social", maxWords: 80, hint: "A caption." },
  ],
  updatedAt: "2026-10-05T00:00:00.000Z",
};

const lindsay: Profile = {
  id: "lindsay",
  name: "lindsay-assistant",
  description: "Profile name Lindsay. Side-work reach-outs.",
  guide: "Direct.",
  systemPrompt: "Write.",
  bannedForPrompt: [],
  surfaces: [
    { id: "first_note", label: "First note", maxWords: null, hint: "A note." },
    { id: "follow_up", label: "Follow-up", maxWords: null, hint: "A follow-up." },
  ],
  updatedAt: "2026-10-05T00:00:00.000Z",
};

function log(over: Partial<HealthLog> & Pick<HealthLog, "id">): HealthLog {
  return {
    createdAt: "2026-10-01T12:00:00.000Z",
    surfaceId: "blog",
    model: "gpt-4o",
    selectedGoldIds: [],
    selectedLearningIds: [],
    warnings: [],
    retried: false,
    retryReason: null,
    outcome: "kept",
    userNote: null,
    ...over,
  };
}

const filled = buildHealthReport(
  [
    log({ id: "g1", outcome: "kept", surfaceId: "blog" }),
    log({
      id: "g2",
      outcome: "edited",
      retried: true,
      model: "claude-opus-4-6",
      warnings: ["unsupported claim"],
      selectedLearningIds: ["learn-1"],
      selectedGoldIds: ["gold-1"],
    }),
    log({
      id: "g3",
      outcome: "rejected",
      warnings: ["unsupported claim"],
      selectedLearningIds: ["learn-1"],
      selectedGoldIds: ["gold-1"],
    }),
    log({ id: "g4", outcome: "pending", surfaceId: "social" }),
  ],
  {
    days: 14,
    learnings: [{ id: "learn-1", rule: "Do not claim wool pellets kill all slugs", kind: "fact" }],
    golds: [{ id: "gold-1", title: "How to", surface: "blog", architecture: "how-to-steps" }],
  },
);

describe("HomeDesk", () => {
  it("shows real counts, the top learning and gold, and keeps an empty profile visible", () => {
    render(
      <HomeDesk
        cards={[
          { profile: woolgrown, report: filled },
          { profile: lindsay, report: buildHealthReport([], { days: 14 }) },
        ]}
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("2 profiles monitored")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "WoolGrown" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "lindsay-assistant" })).toBeInTheDocument();
    expect(screen.getByText("I.")).toBeInTheDocument();
    expect(screen.getByText("II.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("lindsay-assistant");
    expect(screen.getByText("Blog (Active)")).toBeInTheDocument();
    expect(screen.getByText("Shop FAQ")).toBeInTheDocument();
    expect(screen.getByText("First note")).toBeInTheDocument();
    expect(screen.queryByText("First note (Active)")).not.toBeInTheDocument();
    expect(screen.getByText("Direct pass (25%)")).toBeInTheDocument();
    expect(screen.getByText("Manual trim (25%)")).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.getByText("4 generations · 1 kept · 1 edited · 1 rejected · 1 pending")).toBeInTheDocument();
    expect(screen.getByText("1 retry · 25% retry rate")).toBeInTheDocument();
    expect(screen.getByText("Top warning: unsupported claim")).toBeInTheDocument();
    expect(screen.getByText("Most edits and rejections: Blog (2)")).toBeInTheDocument();
    expect(screen.getByText("Most retries: Claude Opus 4.6 (1)")).toBeInTheDocument();
    expect(screen.getByText(/Surfaces needing attention:/)).toHaveTextContent(
      "Blog — 3 generations · 1 edited · 1 rejected · 1 retry · Top warning: unsupported claim",
    );
    expect(screen.getByText(/Common warning:/)).toHaveTextContent("unsupported claim — 2");
    expect(screen.getByText("“Do not claim wool pellets kill all slugs”")).toBeInTheDocument();
    expect(screen.getByText(/fact — 2 uses · 0 kept · 1 edited · 1 rejected · 0 pending · 50% rejected/)).toBeInTheDocument();
    expect(screen.getByText("“How to” • Blog • how-to-steps")).toBeInTheDocument();
    expect(screen.getByText("2 uses · 0 kept · 1 edited · 1 rejected · 0 pending · 50% rejected")).toBeInTheDocument();
    expect(screen.getByText(/Possible claim issue:/)).toHaveTextContent("claim — 2 • Blog • Oct 1, 12:00 PM");
    expect(screen.getByRole("link", { name: "link to that generation" })).toHaveAttribute("href", "/woolgrown#generation-g2");
    expect(screen.getByText("No learnings in this period.")).toBeInTheDocument();
    expect(screen.getByText("No gold examples in this period.")).toBeInTheDocument();
    expect(screen.getByText("No claim warnings logged.")).toBeInTheDocument();
    expect(screen.getByText("No surface needs attention in this period.")).toBeInTheDocument();
    expect(screen.getByText("Temporal Archive Log (Last 14 days)")).toBeInTheDocument();
    expect(screen.getByText("All Clear")).toBeInTheDocument();
    expect(screen.getByText("0 generations · 0 kept · 0 edited · 0 rejected · 0 pending")).toBeInTheDocument();
    expect(screen.getByText("None in this period")).toBeInTheDocument();
    expect(screen.getAllByText("None logged").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("0 retries · 0% retry rate")).toBeInTheDocument();
    expect(screen.getByText("Most edits and rejections: none")).toBeInTheDocument();
    expect(screen.getByText("In this window")).toBeInTheDocument();
    expect(screen.getByText("Top warning: none")).toBeInTheDocument();
    expect(screen.getByText("Most retries: none")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Open project → /woolgrown" })).toHaveAttribute("href", "/woolgrown");
    expect(screen.getByRole("link", { name: "Open project → /lindsay" })).toHaveAttribute("href", "/lindsay");
    expect(screen.getByRole("link", { name: "Open project → /lindsay" })).toHaveClass("bg-surface-container-high");
    for (const link of screen.getAllByRole("link", { name: "Last 14 days" })) {
      expect(link).toHaveAttribute("aria-current", "page");
      expect(link).toHaveAttribute("href", "/?days=14");
    }
    expect(screen.getAllByRole("link", { name: "Last 7 days" })[1]).toHaveAttribute("href", "/?days=7");
    expect(screen.getAllByRole("link", { name: "Last 30 days" })[1]).toHaveAttribute("href", "/?days=30");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "WoolGrown" })).toHaveAttribute("href", "/woolgrown");
    expect(screen.getByRole("link", { name: "lindsay-assistant" })).toHaveAttribute("href", "/lindsay");
    expect(screen.getByText("person").closest("[aria-hidden='true']")).toBeTruthy();
    expect(screen.getByText("© 2025 Voice Editorial System. Preserving focus.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Active Corpus")).not.toBeInTheDocument();
    expect(screen.queryByText("Tactical Sync")).not.toBeInTheDocument();
    expect(screen.queryByText("100% captured")).not.toBeInTheDocument();
    expect(screen.queryByText("Voice mismatch")).not.toBeInTheDocument();
    expect(screen.queryByText("Tone anchor: humble directness")).not.toBeInTheDocument();
    expect(screen.queryByText("Queue cleared")).not.toBeInTheDocument();
  });

  it("keeps the empty learning, gold, and claim lines when a surface still needs attention", () => {
    render(
      <HomeDesk
        cards={[
          {
            profile: woolgrown,
            report: buildHealthReport(
              [log({ id: "g9", outcome: "rejected", warnings: ["too long"] })],
              { days: 7 },
            ),
          },
        ]}
        timeZone="UTC"
      />,
    );

    expect(screen.getByText(/Surfaces needing attention:/)).toHaveTextContent("Blog");
    expect(screen.getByText("No learnings in this period.")).toBeInTheDocument();
    expect(screen.getByText("No gold examples in this period.")).toBeInTheDocument();
    expect(screen.getByText("No claim warnings logged.")).toBeInTheDocument();
    expect(screen.queryByText("All Clear")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Temporal Archive Log (Last 7 days)")).toBeInTheDocument();
  });

  it("shows a learning beside the empty gold and claim lines", () => {
    render(
      <HomeDesk
        cards={[
          {
            profile: woolgrown,
            report: buildHealthReport([log({ id: "g1", outcome: "kept", selectedLearningIds: ["learn-1"] })], {
              days: 14,
              learnings: [{ id: "learn-1", rule: "Keep it short.", kind: "voice" }],
            }),
          },
        ]}
      />,
    );

    expect(screen.getByText("“Keep it short.”")).toBeInTheDocument();
    expect(screen.getByText(/voice — 1 uses · 1 kept · 0 edited · 0 rejected · 0 pending · 0% rejected/)).toBeInTheDocument();
    expect(screen.getByText("No gold examples in this period.")).toBeInTheDocument();
    expect(screen.getByText("No claim warnings logged.")).toBeInTheDocument();
    expect(screen.getByText("No surface needs attention in this period.")).toBeInTheDocument();
    expect(screen.queryByText("All Clear")).not.toBeInTheDocument();
    expect(screen.queryByText(/Temporal Archive Log/)).not.toBeInTheDocument();
  });

  it("marks the surface with the most drafts active, and the earlier surface when they tie", () => {
    const { rerender } = render(
      <HomeDesk
        cards={[
          {
            profile: woolgrown,
            report: buildHealthReport(
              [
                log({ id: "g1", outcome: "kept", surfaceId: "blog" }),
                log({ id: "g2", outcome: "kept", surfaceId: "social" }),
                log({ id: "g3", outcome: "kept", surfaceId: "social" }),
              ],
              { days: 14 },
            ),
          },
        ]}
      />,
    );

    expect(screen.getByText("Social (Active)")).toBeInTheDocument();
    expect(screen.queryByText("Blog (Active)")).not.toBeInTheDocument();

    rerender(
      <HomeDesk
        cards={[
          {
            profile: woolgrown,
            report: buildHealthReport(
              [
                log({ id: "g1", outcome: "kept", surfaceId: "blog" }),
                log({ id: "g2", outcome: "kept", surfaceId: "social" }),
              ],
              { days: 14 },
            ),
          },
        ]}
      />,
    );

    expect(screen.getByText("Blog (Active)")).toBeInTheDocument();
    expect(screen.queryByText("Social (Active)")).not.toBeInTheDocument();
  });

  it("links the claim to the latest draft that raised it", () => {
    render(
      <HomeDesk
        cards={[
          {
            profile: woolgrown,
            report: buildHealthReport(
              [
                log({ id: "g-old", outcome: "rejected", createdAt: "2026-10-01T12:00:00.000Z", warnings: ["unsupported claim"] }),
                log({ id: "g-new", outcome: "rejected", createdAt: "2026-10-03T15:00:00.000Z", warnings: ["unsupported claim"] }),
              ],
              { days: 30 },
            ),
          },
        ]}
        timeZone="UTC"
      />,
    );

    expect(screen.getByRole("link", { name: "link to that generation" })).toHaveAttribute("href", "/woolgrown#generation-g-new");
    expect(screen.getAllByRole("link", { name: "link to that generation" })).toHaveLength(1);
  });
});
