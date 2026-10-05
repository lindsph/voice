import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildHealthReport } from "@/lib/health";
import type { Profile } from "@/lib/types";

import HomePage from "./page";

const { listProfiles, loadHealthReport } = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  loadHealthReport: vi.fn(),
}));

vi.mock("@/lib/store", () => ({ listProfiles }));

vi.mock("@/lib/health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/health")>();
  return { ...actual, loadHealthReport };
});

const profile: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Ontario grower-maker.",
  guide: "Practical.",
  systemPrompt: "Write.",
  bannedForPrompt: [],
  surfaces: [{ id: "blog", label: "Blog", maxWords: null, hint: "A post." }],
  updatedAt: "2026-10-05T00:00:00.000Z",
};

const lindsay: Profile = {
  ...profile,
  id: "lindsay",
  name: "lindsay-assistant",
  description: "Side-work reach-outs.",
};

describe("HomePage", () => {
  beforeEach(() => {
    listProfiles.mockReset();
    loadHealthReport.mockReset();
  });

  it("loads every profile for the selected window", async () => {
    listProfiles.mockResolvedValue([profile]);
    loadHealthReport.mockResolvedValue(buildHealthReport([], { days: 30 }));
    render(await HomePage({ searchParams: Promise.resolve({ days: "30" }) }));
    expect(loadHealthReport).toHaveBeenCalledWith("woolgrown", 30);
    expect(screen.getByRole("link", { name: "Last 30 days" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("No learnings in this period.")).toBeInTheDocument();
    expect(screen.getByText("No gold examples in this period.")).toBeInTheDocument();
    expect(screen.getByText("No claim warnings logged.")).toBeInTheDocument();
    expect(screen.getByText("No surface needs attention in this period.")).toBeInTheDocument();
    expect(screen.getByText("1 profile monitored")).toBeInTheDocument();
  });

  it("loads every profile when the window is missing or not a real choice", async () => {
    listProfiles.mockResolvedValue([profile, lindsay]);
    loadHealthReport.mockImplementation(async (_id: string, days: number) => buildHealthReport([], { days: days as 14 }));
    render(await HomePage({ searchParams: Promise.resolve({ days: "99" }) }));
    expect(loadHealthReport).toHaveBeenCalledWith("woolgrown", 14);
    expect(loadHealthReport).toHaveBeenCalledWith("lindsay", 14);
    expect(screen.getAllByText("No learnings in this period.")).toHaveLength(2);
    expect(screen.getAllByText("No gold examples in this period.")).toHaveLength(2);
    expect(screen.getAllByText("No claim warnings logged.")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Last 14 days" })).toHaveLength(2);
  });

  it("defaults the window to 14 days", async () => {
    listProfiles.mockResolvedValue([]);
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(loadHealthReport).not.toHaveBeenCalled();
    expect(screen.getByText("0 profiles monitored")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Work on voice here.");
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("call it");
  });
});
