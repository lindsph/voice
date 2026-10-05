import { beforeEach, describe, expect, it, vi } from "vitest";

const findLogs = vi.hoisted(() => vi.fn());
const findLearnings = vi.hoisted(() => vi.fn());
const findGolds = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  prisma: {
    generationLog: { findMany: findLogs },
    learning: { findMany: findLearnings },
    gold: { findMany: findGolds },
  },
}));

import {
  CLAIM_TERMS,
  buildHealthReport,
  healthDays,
  healthLogQuery,
  healthSince,
  loadHealthReport,
  type HealthLog,
} from "./health";

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

const woolgrownLogs: HealthLog[] = [
  log({ id: "g1", outcome: "kept", surfaceId: "blog" }),
  log({
    id: "g2",
    outcome: "edited",
    surfaceId: "blog",
    retried: true,
    retryReason: "banned_phrase:delve",
    warnings: ["unsupported claim"],
    selectedLearningIds: ["learn-1"],
    selectedGoldIds: ["gold-1"],
    userNote: "Too sure about slugs.",
  }),
  log({
    id: "g3",
    outcome: "edited",
    surfaceId: "blog",
    warnings: ["unsupported claim"],
    selectedLearningIds: ["learn-1"],
    selectedGoldIds: ["gold-1"],
  }),
  log({
    id: "g4",
    outcome: "rejected",
    surfaceId: "blog",
    retried: true,
    model: "claude-opus-4-6",
    retryReason: "banned_phrase:delve",
    warnings: ["unsupported claim"],
    selectedLearningIds: ["learn-1"],
    selectedGoldIds: ["gold-1"],
  }),
  log({
    id: "g5",
    outcome: "rejected",
    surfaceId: "social",
    retried: true,
    model: "claude-opus-4-6",
    warnings: ["too long"],
    selectedLearningIds: ["learn-2"],
    selectedGoldIds: ["gold-2"],
  }),
  log({
    id: "g6",
    outcome: "pending",
    surfaceId: "social",
    selectedLearningIds: ["learn-2"],
    selectedGoldIds: ["gold-2"],
  }),
  log({ id: "g7", outcome: "kept", surfaceId: "shop_faq", model: null, retried: true }),
];

function report() {
  return buildHealthReport(woolgrownLogs, {
    days: 14,
    learnings: [
      { id: "learn-1", rule: "Do not claim wool pellets kill all slugs", kind: "fact" },
      { id: "learn-2", rule: "Keep the caption short.", kind: "voice" },
    ],
    golds: [
      { id: "gold-1", title: "How to", surface: "blog", architecture: "how-to-steps" },
      { id: "gold-2", title: "Caption", surface: "social", architecture: "" },
    ],
  });
}

describe("buildHealthReport", () => {
  it("counts outcomes, retries, and retry rate", () => {
    const health = report();
    expect(health.total).toBe(7);
    expect(health.kept).toBe(2);
    expect(health.edited).toBe(2);
    expect(health.rejected).toBe(2);
    expect(health.pending).toBe(1);
    expect(health.retryCount).toBe(4);
    expect(health.retryRate).toBeCloseTo(4 / 7);
    expect(health.mostCommonWarning).toBe("unsupported claim");
    expect(health.busiestProblemSurface).toEqual({ surfaceId: "blog", problemCount: 3 });
    expect(health.modelWithMostRetries).toEqual({ model: "claude-opus-4-6", count: 2 });
  });

  it("ranks surfaces by edits plus rejections", () => {
    const health = report();
    expect(health.surfaces.map((surface) => surface.surfaceId)).toEqual(["blog", "social", "shop_faq"]);
    expect(health.surfaces[0]).toMatchObject({
      total: 4,
      edited: 2,
      rejected: 1,
      problemCount: 3,
      kept: 1,
      problemRate: 0.75,
      retryCount: 2,
      topWarning: "unsupported claim",
    });
    expect(health.retryBySurface).toEqual([
      { key: "blog", count: 2 },
      { key: "shop_faq", count: 1 },
      { key: "social", count: 1 },
    ]);
    expect(health.retryByModel).toEqual([
      { key: "claude-opus-4-6", count: 2 },
      { key: "gpt-4o", count: 1 },
    ]);
    expect(health.retryByReason).toEqual([{ key: "banned_phrase:delve", count: 2 }]);
  });

  it("groups warnings", () => {
    const health = report();
    expect(health.warnings[0]).toMatchObject({
      text: "unsupported claim",
      count: 3,
      surfaces: ["blog"],
      retryCount: 2,
    });
    expect(health.warnings[1]).toMatchObject({ text: "too long", count: 1, surfaces: ["social"], retryCount: 1 });
    expect(health.warnings[0]?.latest).toBe("2026-10-01T12:00:00.000Z");
  });

  it("aggregates learning and gold outcomes", () => {
    const health = report();
    expect(health.learnings[0]).toMatchObject({
      id: "learn-2",
      kind: "voice",
      total: 2,
      rejected: 1,
      pending: 1,
      rejectionRate: 0.5,
    });
    expect(health.learnings[1]).toMatchObject({
      id: "learn-1",
      rule: "Do not claim wool pellets kill all slugs",
      kind: "fact",
      total: 3,
      edited: 2,
      rejected: 1,
      rejectionRate: 1 / 3,
    });
    expect(health.golds[0]).toMatchObject({
      id: "gold-2",
      title: "Caption",
      surface: "social",
      architecture: null,
      rejectionRate: 0.5,
    });
    expect(health.golds[1]).toMatchObject({
      id: "gold-1",
      title: "How to",
      architecture: "how-to-steps",
      rejectionRate: 1 / 3,
    });
  });

  it("does not mix another profile into a scoped query", () => {
    const since = new Date("2026-10-01T00:00:00.000Z");
    const woolgrown = healthLogQuery("woolgrown", since);
    const lindsay = healthLogQuery("lindsay", since);
    expect(woolgrown.where.profileId).toBe("woolgrown");
    expect(lindsay.where.profileId).toBe("lindsay");
    expect(woolgrown.where).not.toEqual(lindsay.where);
    expect(woolgrown.select).not.toHaveProperty("facts");
    expect(woolgrown.select).not.toHaveProperty("generatedBody");
    expect(woolgrown.select).not.toHaveProperty("editedBody");
  });

  it("returns an empty report when there are no generations", () => {
    const health = buildHealthReport([], { days: 14 });
    expect(health.total).toBe(0);
    expect(health.retryRate).toBe(0);
    expect(health.surfaces).toEqual([]);
    expect(health.warnings).toEqual([]);
    expect(health.learnings).toEqual([]);
    expect(health.golds).toEqual([]);
    expect(health.claims).toEqual([]);
    expect(health.mostCommonWarning).toBeNull();
    expect(health.busiestProblemSurface).toBeNull();
  });

  it("flags claim words in warnings and notes only", () => {
    const health = buildHealthReport(
      [
        log({
          id: "c1",
          warnings: ["unsupported claim"],
          userNote: "The slug line is too strong.",
          createdAt: "2026-10-02T00:00:00.000Z",
        }),
        log({
          id: "c2",
          surfaceId: "social",
          userNote: "Sounds guaranteed.",
          createdAt: "2026-10-03T00:00:00.000Z",
        }),
      ],
      { days: 14 },
    );
    const terms = Object.fromEntries(health.claims.map((claim) => [claim.term, claim.count]));
    expect(terms.claim).toBe(1);
    expect(terms.unsupported).toBe(1);
    expect(terms.slug).toBe(1);
    expect(terms.guaranteed).toBe(1);
    expect(terms.guarantee).toBe(1);
    expect(health.claims.find((claim) => claim.term === "slug")?.surfaces).toEqual(["blog"]);
    expect(JSON.stringify(health.claims)).not.toContain("too strong");
  });

  it("reads the day choice and defaults to 14", () => {
    expect(healthDays("7")).toBe(7);
    expect(healthDays("14")).toBe(14);
    expect(healthDays("30")).toBe(30);
    expect(healthDays(undefined)).toBe(14);
    expect(healthDays("")).toBe(14);
    expect(healthDays("90")).toBe(14);
    expect(healthDays("7 ")).toBe(14);
  });

  it("counts a repeated warning or learning once per generation", () => {
    const health = buildHealthReport(
      [
        log({
          id: "dup",
          warnings: [" unsupported claim ", "unsupported claim", ""],
          selectedLearningIds: ["learn-1", "learn-1"],
          selectedGoldIds: ["gold-1", "gold-1"],
          outcome: "rejected",
        }),
      ],
      { days: 14 },
    );
    expect(health.warnings).toEqual([
      expect.objectContaining({ text: "unsupported claim", count: 1 }),
    ]);
    expect(health.learnings[0]).toMatchObject({ id: "learn-1", rule: "learn-1", kind: null, total: 1, rejected: 1 });
    expect(health.golds[0]).toMatchObject({ id: "gold-1", title: "gold-1", surface: "", architecture: null, total: 1 });
  });

  it("keeps the newest claim rows and ignores draft text", () => {
    const logs = Array.from({ length: 6 }, (_, index) =>
      log({
        id: `c${index}`,
        createdAt: `2026-10-0${index + 1}T00:00:00.000Z`,
        surfaceId: index % 2 === 0 ? "blog" : "social",
        warnings: ["Claim"],
        userNote: index === 5 ? "Moisture and a PEST note." : null,
      }),
    );
    const health = buildHealthReport(logs, { days: 30 });
    const claim = health.claims.find((item) => item.term === "claim");
    expect(claim).toMatchObject({
      count: 6,
      surfaces: ["blog", "social"],
      latest: "2026-10-06T00:00:00.000Z",
      generationIds: ["c5", "c4", "c3", "c2", "c1"],
    });
    expect(health.claims.map((item) => item.term)).toEqual(expect.arrayContaining(["claim", "moisture", "pest"]));
    expect(JSON.stringify(health)).not.toContain("PEST note");
  });

  it("matches every claim term without reading a generation body", () => {
    const health = buildHealthReport(
      [
        log({
          id: "terms",
          warnings: ["Citation missing"],
          userNote: "claim unsupported SOURCE fact pest slug weed biodegradable moisture guarantee guaranteed",
        }),
      ],
      { days: 7 },
    );
    expect(health.claims.map((claim) => claim.term).sort()).toEqual([...CLAIM_TERMS].sort());
    expect(health.claims.every((claim) => claim.generationIds.includes("terms"))).toBe(true);
  });

  it("breaks ties by usage, then keeps only the top five", () => {
    const logs: HealthLog[] = [];
    for (let index = 0; index < 6; index += 1) {
      const surfaceId = `surface-${index}`;
      for (let copy = 0; copy <= index; copy += 1) {
        logs.push(
          log({
            id: `${surfaceId}-${copy}`,
            surfaceId,
            outcome: "rejected",
            warnings: [`warning-${index}`],
            retried: true,
            retryReason: `reason-${index}`,
            model: `model-${index}`,
            selectedLearningIds: [`learn-${index}`],
            selectedGoldIds: [`gold-${index}`],
          }),
        );
      }
    }
    const health = buildHealthReport(logs, { days: 30 });
    expect(health.surfaces.map((surface) => surface.surfaceId)).toEqual([
      "surface-5",
      "surface-4",
      "surface-3",
      "surface-2",
      "surface-1",
    ]);
    expect(health.warnings.map((warning) => warning.text)).toEqual([
      "warning-5",
      "warning-4",
      "warning-3",
      "warning-2",
      "warning-1",
    ]);
    expect(health.retryByReason.map((row) => row.key)).toEqual([
      "reason-5",
      "reason-4",
      "reason-3",
      "reason-2",
      "reason-1",
    ]);
    expect(health.retryByModel.map((row) => row.key)).toEqual([
      "model-5",
      "model-4",
      "model-3",
      "model-2",
      "model-1",
    ]);
    expect(health.learnings.map((learning) => learning.id)).toEqual([
      "learn-5",
      "learn-4",
      "learn-3",
      "learn-2",
      "learn-1",
    ]);
    expect(health.golds.map((gold) => gold.id)).toEqual(["gold-5", "gold-4", "gold-3", "gold-2", "gold-1"]);
  });

  it("ranks the same rejection rate by usage", () => {
    const health = buildHealthReport(
      [
        log({ id: "h1", outcome: "rejected", selectedLearningIds: ["tie-heavy"], selectedGoldIds: ["tie-gold-heavy"] }),
        log({ id: "h2", outcome: "rejected", selectedLearningIds: ["tie-heavy"], selectedGoldIds: ["tie-gold-heavy"] }),
        log({ id: "h3", outcome: "kept", selectedLearningIds: ["tie-heavy"], selectedGoldIds: ["tie-gold-heavy"] }),
        log({ id: "h4", outcome: "kept", selectedLearningIds: ["tie-heavy"], selectedGoldIds: ["tie-gold-heavy"] }),
        log({ id: "l1", outcome: "rejected", selectedLearningIds: ["tie-light"], selectedGoldIds: ["tie-gold-light"] }),
        log({ id: "l2", outcome: "kept", selectedLearningIds: ["tie-light"], selectedGoldIds: ["tie-gold-light"] }),
      ],
      {
        days: 14,
        learnings: [
          { id: "tie-heavy", rule: "Heavy", kind: "unknown" },
          { id: "tie-light", rule: "Light", kind: "voice" },
        ],
        golds: [
          { id: "tie-gold-heavy", title: "Heavy gold", surface: "blog", architecture: "how-to-steps" },
          { id: "tie-gold-light", title: "Light gold", surface: "social", architecture: null },
        ],
      },
    );
    expect(health.learnings.map((learning) => [learning.id, learning.total, learning.rejectionRate])).toEqual([
      ["tie-heavy", 4, 0.5],
      ["tie-light", 2, 0.5],
    ]);
    expect(health.golds.map((gold) => [gold.id, gold.total, gold.rejectionRate])).toEqual([
      ["tie-gold-heavy", 4, 0.5],
      ["tie-gold-light", 2, 0.5],
    ]);
  });

  it("omits a model or problem surface when the period has neither", () => {
    const health = buildHealthReport(
      [log({ id: "plain", outcome: "kept", retried: true, model: "  ", retryReason: "  " })],
      { days: 14 },
    );
    expect(health.modelWithMostRetries).toBeNull();
    expect(health.busiestProblemSurface).toBeNull();
    expect(health.retryByModel).toEqual([]);
    expect(health.retryByReason).toEqual([]);
    expect(health.retryBySurface).toEqual([{ key: "blog", count: 1 }]);
    expect(health.retryRate).toBe(1);
  });

  it("shares a warning across surfaces and keeps the later date", () => {
    const health = buildHealthReport(
      [
        log({ id: "early", warnings: ["too long"], createdAt: "2026-10-01T00:00:00.000Z", surfaceId: "social" }),
        log({
          id: "late",
          warnings: ["too long"],
          createdAt: "2026-10-04T00:00:00.000Z",
          surfaceId: "blog",
          retried: true,
        }),
      ],
      { days: 14 },
    );
    expect(health.warnings[0]).toMatchObject({
      count: 2,
      surfaces: ["blog", "social"],
      retryCount: 1,
      latest: "2026-10-04T00:00:00.000Z",
    });
  });

  it("measures the window back from now", () => {
    const now = new Date("2026-10-15T00:00:00.000Z");
    expect(healthSince(7, now).toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(healthSince(14, now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(healthSince(30, now).toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });
});

describe("loadHealthReport", () => {
  beforeEach(() => {
    findLogs.mockReset();
    findLearnings.mockReset();
    findGolds.mockReset();
  });

  it("loads one profile and leaves bodies out of the summary", async () => {
    const now = new Date("2026-10-15T00:00:00.000Z");
    findLogs.mockResolvedValue([
      {
        id: "g1",
        createdAt: new Date("2026-10-14T00:00:00.000Z"),
        surfaceId: "blog",
        model: "gpt-4o",
        selectedGoldIds: ["gold-other"],
        selectedLearningIds: ["learn-1", "learn-1"],
        warnings: ["Unsupported claim"],
        retried: false,
        retryReason: null,
        outcome: "approved",
        userNote: "A secret moisture note.",
      },
    ]);
    findLearnings.mockResolvedValue([{ id: "learn-1", rule: "Stay specific.", kind: "fact" }]);
    findGolds.mockResolvedValue([]);

    const health = await loadHealthReport("woolgrown", 7, now);
    const query = findLogs.mock.calls[0]?.[0];
    expect(query.where).toEqual({
      profileId: "woolgrown",
      createdAt: { gte: healthSince(7, now) },
    });
    expect(query.select).not.toHaveProperty("facts");
    expect(query.select).not.toHaveProperty("generatedBody");
    expect(query.select).not.toHaveProperty("editedBody");
    expect(query.select.userNote).toBe(true);
    expect(findLearnings).toHaveBeenCalledWith({
      where: { profileId: "woolgrown", id: { in: ["learn-1"] } },
      select: { id: true, rule: true, kind: true },
    });
    expect(findGolds).toHaveBeenCalledWith({
      where: { profileId: "woolgrown", id: { in: ["gold-other"] } },
      select: { id: true, title: true, surface: true, architecture: true },
    });
    expect(health.pending).toBe(1);
    expect(health.learnings[0]).toMatchObject({ id: "learn-1", rule: "Stay specific.", kind: "fact", total: 1 });
    expect(health.golds[0]).toMatchObject({ id: "gold-other", title: "gold-other" });
    expect(health.claims.map((claim) => claim.term)).toEqual(expect.arrayContaining(["claim", "unsupported", "moisture"]));
    expect(JSON.stringify(health)).not.toContain("secret");
    expect(JSON.stringify(health)).not.toContain("A secret moisture note");
  });

  it("does not ask for learnings or golds from another profile", async () => {
    findLogs.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "lindsay-1",
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
        surfaceId: "first_note",
        model: null,
        selectedGoldIds: ["lindsay-gold"],
        selectedLearningIds: ["lindsay-learn"],
        warnings: [],
        retried: false,
        retryReason: null,
        outcome: "kept",
        userNote: null,
      },
    ]);
    findLearnings.mockResolvedValue([{ id: "lindsay-learn", rule: "Skip the intro.", kind: "accuracy" }]);
    findGolds.mockResolvedValue([
      { id: "lindsay-gold", title: "Note", surface: "first_note", architecture: "   " },
    ]);

    const woolgrown = await loadHealthReport("woolgrown", 14);
    expect(woolgrown.total).toBe(0);
    expect(findLearnings).not.toHaveBeenCalled();
    expect(findGolds).not.toHaveBeenCalled();

    const lindsay = await loadHealthReport("lindsay", 14);
    expect(findLogs.mock.calls[1]?.[0].where.profileId).toBe("lindsay");
    expect(findLearnings.mock.calls[0]?.[0].where.profileId).toBe("lindsay");
    expect(findGolds.mock.calls[0]?.[0].where.profileId).toBe("lindsay");
    expect(findLearnings.mock.calls[0]?.[0].where.id.in).toEqual(["lindsay-learn"]);
    expect(lindsay.learnings[0]).toMatchObject({ rule: "Skip the intro.", kind: null });
    expect(lindsay.golds[0]).toMatchObject({ title: "Note", architecture: null });
    expect(JSON.stringify(lindsay)).not.toContain("woolgrown");
  });
});
