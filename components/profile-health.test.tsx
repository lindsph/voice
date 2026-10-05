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
    expect(screen.getByText("Generations").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Kept").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Edited").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Rejected").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Pending").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Retries").parentElement).toHaveTextContent("0 (0%)");
    for (const heading of ["Top Surfaces", "Top Warnings", "Retries Audit", "Top Learnings", "Top Golds", "Possible Claim Issues"]) {
      expect(screen.getByRole("heading", { name: new RegExp(heading) })).toBeInTheDocument();
    }
    expect(screen.getByText("By surface: —")).toBeInTheDocument();
    expect(screen.getByText("By model: —")).toBeInTheDocument();
    expect(screen.getByText("By reason: —")).toBeInTheDocument();
    expect(screen.getAllByText("0 uses · 0 kept · 0 edited · 0 rejected · 0%")).toHaveLength(2);
    expect(screen.queryByText("No generations in this period.")).not.toBeInTheDocument();
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
    expect(screen.getByText("Generations").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Kept").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Edited").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Rejected").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Pending").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Retries").parentElement).toHaveTextContent("0 (0%)");
    expect(screen.getByRole("heading", { name: /Top Warnings/ }).closest("article")).toHaveTextContent("—");
    expect(screen.getByText("By surface: —")).toBeInTheDocument();
    expect(screen.getByText("By model: —")).toBeInTheDocument();
    expect(screen.getByText("By reason: —")).toBeInTheDocument();
    expect(screen.getAllByText("0 uses · 0 kept · 0 edited · 0 rejected · 0%")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: /Possible Claim Issues/ }).closest("article")).toHaveTextContent("—");
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

    expect(screen.getByText("Generations").parentElement).toHaveTextContent("3");
    expect(screen.getByText("Retries").parentElement).toHaveTextContent("2 (67%)");
    expect(screen.getByText("1 edited · 0 rejected · 1 retries · unsupported claim")).toBeInTheDocument();
    expect(screen.getByText("0 edited · 1 rejected · 1 retries · unsupported claim")).toBeInTheDocument();
    expect(screen.getByText(/Blog, shop_faq · 2 retries · Oct 3, 3:00 PM/)).toBeInTheDocument();
    expect(screen.getByText("By surface: Blog")).toBeInTheDocument();
    expect(screen.getByText("By surface: shop_faq")).toBeInTheDocument();
    expect(screen.getByText("By model: claude-opus-4-6")).toBeInTheDocument();
    expect(screen.getByText("By model: gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("By reason: banned_phrase:delve")).toBeInTheDocument();
    expect(screen.getByText("Do not claim wool pellets kill all slugs")).toBeInTheDocument();
    expect(screen.getByText("fact · 2 uses · 0 kept · 1 edited · 1 rejected · 0 pending · 50%")).toBeInTheDocument();
    expect(screen.getByText("How to")).toBeInTheDocument();
    expect(screen.getByText("Blog · how-to-steps · 2 uses · 0 kept · 1 edited · 1 rejected · 0 pending · 50%")).toBeInTheDocument();
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
    expect(screen.getByText("By surface: Blog")).toBeInTheDocument();
    expect(screen.getByText("By model: —")).toBeInTheDocument();
    expect(screen.getByText("By reason: —")).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: /Top Surfaces/ }).closest("article")).toHaveTextContent("—");
  });
});
