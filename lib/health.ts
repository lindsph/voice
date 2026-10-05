import { prisma } from "./db";
import type { GenerationOutcome } from "./types";

export const HEALTH_DAY_CHOICES = [7, 14, 30] as const;

export type HealthDays = (typeof HEALTH_DAY_CHOICES)[number];

export const CLAIM_TERMS = [
  "claim",
  "citation",
  "unsupported",
  "source",
  "fact",
  "pest",
  "slug",
  "weed",
  "biodegradable",
  "moisture",
  "guarantee",
  "guaranteed",
] as const;

const TOP = 5;

export type HealthLog = {
  id: string;
  createdAt: string;
  surfaceId: string;
  model: string | null;
  selectedGoldIds: string[];
  selectedLearningIds: string[];
  warnings: string[];
  retried: boolean;
  retryReason: string | null;
  outcome: GenerationOutcome;
  userNote?: string | null;
};

export type HealthLearningRef = {
  id: string;
  rule: string;
  kind: "voice" | "fact" | "unknown" | null;
};

export type HealthGoldRef = {
  id: string;
  title: string;
  surface: string;
  architecture: string | null;
};

export type HealthReport = {
  days: HealthDays;
  total: number;
  kept: number;
  edited: number;
  rejected: number;
  pending: number;
  retryCount: number;
  retryRate: number;
  mostCommonWarning: string | null;
  busiestProblemSurface: { surfaceId: string; problemCount: number } | null;
  modelWithMostRetries: { model: string; count: number } | null;
  surfaces: Array<{
    surfaceId: string;
    total: number;
    kept: number;
    edited: number;
    rejected: number;
    problemCount: number;
    problemRate: number;
    retryCount: number;
    topWarning: string | null;
  }>;
  warnings: Array<{
    text: string;
    count: number;
    surfaces: string[];
    retryCount: number;
    latest: string;
  }>;
  retryBySurface: Array<{ key: string; count: number }>;
  retryByModel: Array<{ key: string; count: number }>;
  retryByReason: Array<{ key: string; count: number }>;
  learnings: Array<{
    id: string;
    rule: string;
    kind: "voice" | "fact" | "unknown" | null;
    total: number;
    kept: number;
    edited: number;
    rejected: number;
    pending: number;
    rejectionRate: number;
  }>;
  golds: Array<{
    id: string;
    title: string;
    surface: string;
    architecture: string | null;
    total: number;
    kept: number;
    edited: number;
    rejected: number;
    pending: number;
    rejectionRate: number;
  }>;
  claims: Array<{
    term: string;
    count: number;
    surfaces: string[];
    latest: string;
    generationIds: string[];
  }>;
};

export function healthDays(value: string | undefined): HealthDays {
  if (value === "7" || value === "14" || value === "30") return Number(value) as HealthDays;
  return 14;
}

export function healthSince(days: HealthDays, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function healthLogQuery(profileId: string, since: Date) {
  return {
    where: {
      profileId,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      createdAt: true,
      surfaceId: true,
      model: true,
      selectedGoldIds: true,
      selectedLearningIds: true,
      warnings: true,
      retried: true,
      retryReason: true,
      outcome: true,
      userNote: true,
    },
  } as const;
}

function ratio(part: number, total: number): number {
  if (total === 0) return 0;
  return part / total;
}

function topCounted(counts: Map<string, number>): Array<{ key: string; count: number }> {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, TOP)
    .map(([key, count]) => ({ key, count }));
}

function outcomeBucket(): Record<GenerationOutcome, number> {
  return { pending: 0, kept: 0, edited: 0, rejected: 0 };
}

export function buildHealthReport(
  logs: HealthLog[],
  input: {
    days: HealthDays;
    learnings?: HealthLearningRef[];
    golds?: HealthGoldRef[];
  },
): HealthReport {
  const kept = logs.filter((log) => log.outcome === "kept").length;
  const edited = logs.filter((log) => log.outcome === "edited").length;
  const rejected = logs.filter((log) => log.outcome === "rejected").length;
  const pending = logs.filter((log) => log.outcome === "pending").length;
  const retries = logs.filter((log) => log.retried);

  const warningCounts = new Map<string, { count: number; surfaces: Set<string>; retries: number; latest: string }>();
  const surfaceRows = new Map<
    string,
    {
      total: number;
      kept: number;
      edited: number;
      rejected: number;
      retryCount: number;
      warnings: Map<string, number>;
    }
  >();
  const retrySurfaces = new Map<string, number>();
  const retryModels = new Map<string, number>();
  const retryReasons = new Map<string, number>();
  const learningRows = new Map<string, ReturnType<typeof outcomeBucket>>();
  const goldRows = new Map<string, ReturnType<typeof outcomeBucket>>();
  const claimRows = new Map<string, { count: number; surfaces: Set<string>; latest: string; ids: string[] }>();

  for (const log of logs) {
    const surface = surfaceRows.get(log.surfaceId) ?? {
      total: 0,
      kept: 0,
      edited: 0,
      rejected: 0,
      retryCount: 0,
      warnings: new Map<string, number>(),
    };
    surface.total += 1;
    if (log.outcome === "kept" || log.outcome === "edited" || log.outcome === "rejected") {
      surface[log.outcome] += 1;
    }
    if (log.retried) surface.retryCount += 1;
    surfaceRows.set(log.surfaceId, surface);

    const seenWarnings = new Set(log.warnings.map((warning) => warning.trim()).filter(Boolean));
    for (const warning of seenWarnings) {
      const row = warningCounts.get(warning) ?? {
        count: 0,
        surfaces: new Set<string>(),
        retries: 0,
        latest: log.createdAt,
      };
      row.count += 1;
      row.surfaces.add(log.surfaceId);
      if (log.retried) row.retries += 1;
      if (log.createdAt > row.latest) row.latest = log.createdAt;
      warningCounts.set(warning, row);
      surface.warnings.set(warning, (surface.warnings.get(warning) ?? 0) + 1);
    }

    if (log.retried) {
      retrySurfaces.set(log.surfaceId, (retrySurfaces.get(log.surfaceId) ?? 0) + 1);
      const model = log.model?.trim();
      if (model) retryModels.set(model, (retryModels.get(model) ?? 0) + 1);
      const reason = log.retryReason?.trim();
      if (reason) retryReasons.set(reason, (retryReasons.get(reason) ?? 0) + 1);
    }

    for (const id of new Set(log.selectedLearningIds)) {
      const row = learningRows.get(id) ?? outcomeBucket();
      row[log.outcome] += 1;
      learningRows.set(id, row);
    }
    for (const id of new Set(log.selectedGoldIds)) {
      const row = goldRows.get(id) ?? outcomeBucket();
      row[log.outcome] += 1;
      goldRows.set(id, row);
    }

    const haystack = `${[...seenWarnings].join("\n")}\n${log.userNote ?? ""}`.toLowerCase();
    for (const term of CLAIM_TERMS) {
      if (!haystack.includes(term)) continue;
      const row = claimRows.get(term) ?? {
        count: 0,
        surfaces: new Set<string>(),
        latest: log.createdAt,
        ids: [],
      };
      row.count += 1;
      row.surfaces.add(log.surfaceId);
      if (log.createdAt >= row.latest) {
        row.latest = log.createdAt;
      }
      row.ids.push(log.id);
      row.ids.sort((left, right) => {
        const leftAt = logs.find((item) => item.id === left)?.createdAt ?? "";
        const rightAt = logs.find((item) => item.id === right)?.createdAt ?? "";
        return rightAt.localeCompare(leftAt);
      });
      row.ids = row.ids.slice(0, TOP);
      claimRows.set(term, row);
    }
  }

  const warningList = [...warningCounts.entries()]
    .sort((left, right) => right[1].count - left[1].count || right[1].latest.localeCompare(left[1].latest))
    .slice(0, TOP);

  const surfaces = [...surfaceRows.entries()]
    .map(([surfaceId, row]) => {
      const problemCount = row.edited + row.rejected;
      const topWarning =
        [...row.warnings.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ??
        null;
      return {
        surfaceId,
        total: row.total,
        kept: row.kept,
        edited: row.edited,
        rejected: row.rejected,
        problemCount,
        problemRate: ratio(problemCount, row.total),
        retryCount: row.retryCount,
        topWarning,
      };
    })
    .sort(
      (left, right) =>
        right.problemCount - left.problemCount || right.total - left.total || left.surfaceId.localeCompare(right.surfaceId),
    )
    .slice(0, TOP);

  const busiest = surfaces.find((surface) => surface.problemCount > 0) ?? null;
  const learningRefs = new Map((input.learnings ?? []).map((item) => [item.id, item]));
  const goldRefs = new Map((input.golds ?? []).map((item) => [item.id, item]));

  const learnings = [...learningRows.entries()]
    .map(([id, row]) => {
      const total = row.kept + row.edited + row.rejected + row.pending;
      const ref = learningRefs.get(id);
      return {
        id,
        rule: ref?.rule ?? id,
        kind: ref?.kind ?? null,
        total,
        kept: row.kept,
        edited: row.edited,
        rejected: row.rejected,
        pending: row.pending,
        rejectionRate: ratio(row.rejected, total),
      };
    })
    .sort((left, right) => right.rejectionRate - left.rejectionRate || right.total - left.total || left.id.localeCompare(right.id))
    .slice(0, TOP);

  const golds = [...goldRows.entries()]
    .map(([id, row]) => {
      const total = row.kept + row.edited + row.rejected + row.pending;
      const ref = goldRefs.get(id);
      return {
        id,
        title: ref?.title ?? id,
        surface: ref?.surface ?? "",
        architecture: ref?.architecture?.trim() ? ref.architecture : null,
        total,
        kept: row.kept,
        edited: row.edited,
        rejected: row.rejected,
        pending: row.pending,
        rejectionRate: ratio(row.rejected, total),
      };
    })
    .sort((left, right) => right.rejectionRate - left.rejectionRate || right.total - left.total || left.id.localeCompare(right.id))
    .slice(0, TOP);

  const claims = [...claimRows.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .map(([term, row]) => ({
      term,
      count: row.count,
      surfaces: [...row.surfaces].sort(),
      latest: row.latest,
      generationIds: row.ids,
    }));

  const modelRetries = topCounted(retryModels);

  return {
    days: input.days,
    total: logs.length,
    kept,
    edited,
    rejected,
    pending,
    retryCount: retries.length,
    retryRate: ratio(retries.length, logs.length),
    mostCommonWarning: warningList[0]?.[0] ?? null,
    busiestProblemSurface: busiest
      ? { surfaceId: busiest.surfaceId, problemCount: busiest.problemCount }
      : null,
    modelWithMostRetries: modelRetries[0] ? { model: modelRetries[0].key, count: modelRetries[0].count } : null,
    surfaces,
    warnings: warningList.map(([text, row]) => ({
      text,
      count: row.count,
      surfaces: [...row.surfaces].sort(),
      retryCount: row.retries,
      latest: row.latest,
    })),
    retryBySurface: topCounted(retrySurfaces),
    retryByModel: modelRetries,
    retryByReason: topCounted(retryReasons),
    learnings,
    golds,
    claims,
  };
}

function asOutcome(value: string): GenerationOutcome {
  if (value === "kept" || value === "edited" || value === "rejected" || value === "pending") return value;
  return "pending";
}

export async function loadHealthReport(profileId: string, days: HealthDays, now = new Date()): Promise<HealthReport> {
  const since = healthSince(days, now);
  const rows = await prisma.generationLog.findMany(healthLogQuery(profileId, since));
  const logs: HealthLog[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    surfaceId: row.surfaceId,
    model: row.model,
    selectedGoldIds: row.selectedGoldIds,
    selectedLearningIds: row.selectedLearningIds,
    warnings: row.warnings,
    retried: row.retried,
    retryReason: row.retryReason,
    outcome: asOutcome(row.outcome),
    userNote: row.userNote,
  }));
  const learningIds = [...new Set(logs.flatMap((log) => log.selectedLearningIds))];
  const goldIds = [...new Set(logs.flatMap((log) => log.selectedGoldIds))];
  const [learnings, golds] = await Promise.all([
    learningIds.length === 0
      ? []
      : prisma.learning.findMany({
          where: { profileId, id: { in: learningIds } },
          select: { id: true, rule: true, kind: true },
        }),
    goldIds.length === 0
      ? []
      : prisma.gold.findMany({
          where: { profileId, id: { in: goldIds } },
          select: { id: true, title: true, surface: true, architecture: true },
        }),
  ]);
  return buildHealthReport(logs, {
    days,
    learnings: learnings.map((row) => ({
      id: row.id,
      rule: row.rule,
      kind: row.kind === "voice" || row.kind === "fact" || row.kind === "unknown" ? row.kind : null,
    })),
    golds: golds.map((row) => ({
      id: row.id,
      title: row.title,
      surface: row.surface,
      architecture: row.architecture,
    })),
  });
}
