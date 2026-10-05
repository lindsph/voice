import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildHealthReport, type HealthDays } from "@/lib/health";
import type { Gold, Learning, Profile } from "@/lib/types";

import ProfilePage from "./page";

const { getProfile, listGolds, listLearnings, listGenerationLogs, loadHealthReport } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listGolds: vi.fn(),
  listLearnings: vi.fn(),
  listGenerationLogs: vi.fn(),
  loadHealthReport: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("not-found");
  },
}));

vi.mock("@/lib/store", () => ({ getProfile, listGolds, listLearnings }));

vi.mock("@/lib/generation-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-log")>();
  return { ...actual, listGenerationLogs };
});

vi.mock("@/lib/health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/health")>();
  return { ...actual, loadHealthReport };
});

const profile: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Ontario grower-maker. Garden wool.",
  guide: `## Who we sound like\n\nA practical Ontario grower-maker.\n\n- Moisture first: less watering.\n`,
  systemPrompt: "Write.",
  bannedForPrompt: [],
  surfaces: [
    { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
    { id: "shop_faq", label: "Shop FAQ", maxWords: 120, hint: "A short answer." },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

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

function pageProps(days?: string) {
  return {
    params: Promise.resolve({ profile: "woolgrown" }),
    searchParams: Promise.resolve(days ? { days } : {}),
  };
}

describe("Profile page", () => {
  beforeEach(() => {
    getProfile.mockReset();
    listGolds.mockReset();
    listLearnings.mockReset();
    listGenerationLogs.mockReset();
    loadHealthReport.mockReset();
    getProfile.mockResolvedValue(profile);
    listGolds.mockResolvedValue([gold]);
    listLearnings.mockResolvedValue([learning]);
    listGenerationLogs.mockResolvedValue([]);
    loadHealthReport.mockImplementation(async (_id: string, days: HealthDays) => buildHealthReport([], { days }));
  });

  it("renders the profile chrome, guide, gold, teaching, empty health, and empty generation card", async () => {
    render(await ProfilePage(pageProps("30")));

    expect(screen.getByRole("link", { name: "Voice" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to all profiles" })).not.toBeInTheDocument();
    expect(screen.queryByText("v4.6 Opus Core")).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "WoolGrown" })).toBeInTheDocument();
    expect(screen.getByText("Active Model Calibration")).toBeInTheDocument();
    expect(screen.getAllByText("Ontario grower-maker. Garden wool.").length).toBeGreaterThan(0);
    expect(screen.getByText("Surfaces: Blog · Shop FAQ")).toBeInTheDocument();
    expect(screen.getByText("Core Directive")).toBeInTheDocument();
    expect(screen.getByText("Profile ID: woolgrown")).toBeInTheDocument();
    expect(screen.getByText("Verified Origin")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Who we sound like." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Moisture first" })).toBeInTheDocument();
    expect(screen.getByText("How to")).toBeInTheDocument();
    expect(screen.getByText("Do not claim wool pellets kill all slugs")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Health" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Last 30 days" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Generations").parentElement).toHaveTextContent("0");
    expect(screen.getByText("By surface: —")).toBeInTheDocument();
    expect(screen.queryByText("No generations in this period.")).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Recent generations" })).toBeInTheDocument();
    expect(screen.getByText("0 Generations Logged")).toBeInTheDocument();
    expect(screen.getByText("Retried: 0")).toBeInTheDocument();
    expect(screen.queryByText("No drafts logged yet.")).not.toBeInTheDocument();

    expect(screen.getByText("— Cadence & Prose")).toBeInTheDocument();
    expect(screen.getByText("© 2025 Voice Editorial System. Preserving focus.")).toBeInTheDocument();
    expect(loadHealthReport).toHaveBeenCalledWith("woolgrown", 30);
    expect(listGolds).toHaveBeenCalledWith("woolgrown");
    expect(listLearnings).toHaveBeenCalledWith("woolgrown");
    expect(listGenerationLogs).toHaveBeenCalledWith("woolgrown");
  });

  it("defaults the health window to 14 days", async () => {
    render(await ProfilePage(pageProps()));
    expect(loadHealthReport).toHaveBeenCalledWith("woolgrown", 14);
    expect(screen.getByRole("link", { name: "Last 14 days" })).toHaveAttribute("aria-current", "page");
  });

  it("does not render a missing profile", async () => {
    getProfile.mockRejectedValue(new Error("missing"));
    await expect(ProfilePage(pageProps())).rejects.toThrow("not-found");
  });
});
