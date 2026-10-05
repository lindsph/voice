import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildHealthReport, type HealthLog } from "@/lib/health";
import type { Profile } from "@/lib/types";

import { ProfileHealth } from "./profile-health";

const profile: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Maker",
  guide: "Practical.",
  systemPrompt: "Write.",
  bannedForPrompt: [],
  surfaces: [
    { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
    { id: "social", label: "Social", maxWords: 80, hint: "A caption." },
  ],
  updatedAt: "2026-10-05T00:00:00.000Z",
};

describe("ProfileHealth", () => {
  it("says when the period has no generations", () => {
    render(<ProfileHealth profile={profile} report={buildHealthReport([], { days: 14 })} />);
    expect(screen.getByRole("heading", { name: "Health" })).toBeInTheDocument();
    expect(screen.getByText("No generations in this period.")).toBeInTheDocument();
    expect(screen.queryByText("Surfaces needing attention")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Last 14 days" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("href", "?days=7");
    expect(screen.getByRole("link", { name: "Last 30 days" })).toHaveAttribute("href", "?days=30");
  });

  it("shows the summary and empty sections without actions", () => {
    const logs: HealthLog[] = [
      {
        id: "g1",
        createdAt: "2026-10-02T00:00:00.000Z",
        surfaceId: "blog",
        model: "gpt-4o",
        selectedGoldIds: [],
        selectedLearningIds: [],
        warnings: [],
        retried: false,
        retryReason: null,
        outcome: "kept",
      },
    ];
    render(<ProfileHealth profile={profile} report={buildHealthReport(logs, { days: 7 })} />);
    expect(screen.getByText("1 generation")).toBeInTheDocument();
    expect(screen.getByText("1 kept")).toBeInTheDocument();
    expect(screen.getByText("0 edited")).toBeInTheDocument();
    expect(screen.getByText("0 rejected")).toBeInTheDocument();
    expect(screen.getByText("0 pending")).toBeInTheDocument();
    expect(screen.getByText("0 retries · 0%")).toBeInTheDocument();
    expect(screen.getByText("Top warning: none")).toBeInTheDocument();
    expect(screen.getByText("Most edits and rejections: none")).toBeInTheDocument();
    expect(screen.queryByText(/Most retries:/)).not.toBeInTheDocument();
    expect(screen.getByText("No warnings in this period.")).toBeInTheDocument();
    expect(screen.getByText("No retries in this period.")).toBeInTheDocument();
    expect(screen.getByText("No learnings in this period.")).toBeInTheDocument();
    expect(screen.getByText("No gold examples in this period.")).toBeInTheDocument();
    expect(screen.getByText("No claim-related warnings or notes in this period.")).toBeInTheDocument();
    expect(screen.getAllByText("Correlation, not proof.")).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Last 14 days" })).not.toHaveAttribute("aria-current");
  });

  it("shows ranked rows, claim links, and no review actions", () => {
    const logs: HealthLog[] = [
      {
        id: "g-edit",
        createdAt: "2026-10-02T15:00:00.000Z",
        surfaceId: "blog",
        model: "gpt-4o",
        selectedGoldIds: ["gold-1"],
        selectedLearningIds: ["learn-1"],
        warnings: ["unsupported claim"],
        retried: true,
        retryReason: "banned_phrase:delve",
        outcome: "edited",
        userNote: "Too sure about slugs.",
      },
      {
        id: "g-reject",
        createdAt: "2026-10-03T15:00:00.000Z",
        surfaceId: "shop_faq",
        model: "claude-opus-4-6",
        selectedGoldIds: ["gold-1"],
        selectedLearningIds: ["learn-1"],
        warnings: ["unsupported claim"],
        retried: true,
        retryReason: "banned_phrase:delve",
        outcome: "rejected",
      },
      {
        id: "g-kept",
        createdAt: "2026-10-01T15:00:00.000Z",
        surfaceId: "blog",
        model: null,
        selectedGoldIds: [],
        selectedLearningIds: [],
        warnings: [],
        retried: false,
        retryReason: null,
        outcome: "kept",
      },
    ];
    render(
      <ProfileHealth
        profile={profile}
        timeZone="UTC"
        report={buildHealthReport(logs, {
          days: 30,
          learnings: [{ id: "learn-1", rule: "Do not claim wool pellets kill all slugs", kind: "fact" }],
          golds: [{ id: "gold-1", title: "How to", surface: "blog", architecture: "how-to-steps" }],
        })}
      />,
    );

    expect(screen.getByText("3 generations")).toBeInTheDocument();
    expect(screen.getByText("2 retries · 67%")).toBeInTheDocument();
    expect(screen.getByText("Top warning: unsupported claim")).toBeInTheDocument();
    expect(screen.getByText("Most edits and rejections: Blog (1)")).toBeInTheDocument();
    expect(screen.getByText("Most retries: claude-opus-4-6 (1)")).toBeInTheDocument();
    expect(
      screen.getByText("Blog — 2 generations · 1 edited · 0 rejected · 50% edited or rejected · 1 retries · Top warning: unsupported claim"),
    ).toBeInTheDocument();
    expect(screen.getByText(/shop_faq — 1 generations · 0 edited · 1 rejected/)).toBeInTheDocument();
    expect(screen.getByText(/unsupported claim — 2 · Blog, shop_faq · 2 retries · Oct 3, 3:00 PM/)).toBeInTheDocument();
    expect(screen.getByText("2 retries · 67% of generations")).toBeInTheDocument();
    expect(screen.getByText("By surface: Blog 1 · shop_faq 1")).toBeInTheDocument();
    expect(screen.getByText("By model: claude-opus-4-6 1 · gpt-4o 1")).toBeInTheDocument();
    expect(screen.getByText("By reason: banned_phrase:delve 2")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Do not claim wool pellets kill all slugs · fact — 2 uses · 0 kept · 1 edited · 1 rejected · 0 pending · 50%",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("How to · Blog · how-to-steps — 2 uses · 0 kept · 1 edited · 1 rejected · 0 pending · 50%"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Correlation, not proof.")).toHaveLength(2);
    const claimLinks = screen.getAllByRole("link", { name: "g-edit" });
    expect(claimLinks.length).toBeGreaterThan(0);
    for (const claimLink of claimLinks) {
      expect(claimLink).toHaveAttribute("href", "#generation-g-edit");
    }
    expect(screen.queryByText("Too sure about slugs.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    for (const action of ["Delete", "Dismiss", "Retire", "Approve"]) {
      expect(screen.queryByText(action)).not.toBeInTheDocument();
    }
  });

  it("says when a retry has no model or reason", () => {
    render(
      <ProfileHealth
        profile={profile}
        report={buildHealthReport(
          [
            {
              id: "g-retry",
              createdAt: "2026-10-02T00:00:00.000Z",
              surfaceId: "blog",
              model: null,
              selectedGoldIds: [],
              selectedLearningIds: [],
              warnings: [],
              retried: true,
              retryReason: null,
              outcome: "pending",
            },
          ],
          { days: 14 },
        )}
      />,
    );
    expect(screen.getByText("By surface: Blog 1")).toBeInTheDocument();
    expect(screen.getByText("No model on these retries.")).toBeInTheDocument();
    expect(screen.getByText("No retry reason recorded.")).toBeInTheDocument();
    expect(screen.queryByText(/Most retries:/)).not.toBeInTheDocument();
  });

  it("says when a populated report has no surface rows", () => {
    const report = buildHealthReport(
      [
        {
          id: "g1",
          createdAt: "2026-10-02T00:00:00.000Z",
          surfaceId: "blog",
          model: "gpt-4o",
          selectedGoldIds: [],
          selectedLearningIds: [],
          warnings: [],
          retried: false,
          retryReason: null,
          outcome: "kept",
        },
      ],
      { days: 14 },
    );
    render(<ProfileHealth profile={profile} report={{ ...report, surfaces: [] }} />);
    expect(screen.getByText("No surfaces in this period.")).toBeInTheDocument();
  });
});
