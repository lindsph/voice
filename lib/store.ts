import { prisma } from "./db";
import { formatToneBundle } from "./bundle";
import { completeDraft, DRAFT_MODEL, generateDraft } from "./generate";
import { inferPreference } from "./infer";
import { isQuotedSnippetRule, rejectedFromApprove } from "./learn";
import type { DraftTrace, Gold, Learning, Profile, Surface } from "./types";

function iso(value: Date): string {
  return value.toISOString();
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toProfile(row: {
  id: string;
  name: string;
  description: string;
  guide: string;
  systemPrompt: string;
  bannedForPrompt: string;
  surfaces: string;
  updatedAt: Date;
}): Profile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    guide: row.guide,
    systemPrompt: row.systemPrompt,
    bannedForPrompt: parseJson<string[]>(row.bannedForPrompt, []),
    surfaces: parseJson<Surface[]>(row.surfaces, []),
    updatedAt: iso(row.updatedAt),
  };
}

function toGold(row: {
  id: string;
  profileId: string;
  title: string;
  body: string;
  rejected?: string;
  source: string;
  surface: string;
  architecture?: string;
  canonical: boolean;
  status: string;
  createdAt: Date;
}): Gold {
  return {
    id: row.id,
    profileId: row.profileId,
    title: row.title,
    body: row.body,
    rejected: row.rejected ?? "",
    source: row.source,
    surface: row.surface,
    architecture: row.architecture ?? "",
    canonical: row.canonical,
    status: row.status === "dismissed" ? "dismissed" : "active",
    createdAt: iso(row.createdAt),
  };
}

function toLearning(row: {
  id: string;
  profileId: string;
  rule: string;
  status: string;
  before: string;
  after: string;
  why: string;
  surface: string;
  sourceDraftId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Learning {
  return {
    id: row.id,
    profileId: row.profileId,
    rule: row.rule,
    status: row.status === "dismissed" ? "dismissed" : "active",
    before: row.before,
    after: row.after,
    why: row.why,
    surface: row.surface,
    sourceDraftId: row.sourceDraftId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export async function listProfiles(): Promise<Profile[]> {
  const rows = await prisma.profile.findMany({ orderBy: { name: "asc" } });
  return rows.map(toProfile);
}

export async function getProfile(id: string): Promise<Profile> {
  const row = await prisma.profile.findUnique({ where: { id } });
  if (!row) throw new Error(`Unknown profile: ${id}`);
  return toProfile(row);
}

export async function updateGuide(id: string, guide: string): Promise<Profile> {
  const row = await prisma.profile.update({
    where: { id },
    data: { guide },
  });
  return toProfile(row);
}

export async function listGolds(profileId: string): Promise<Gold[]> {
  const rows = await prisma.gold.findMany({
    where: { profileId, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toGold);
}

export async function listLearnings(profileId: string): Promise<Learning[]> {
  const rows = await prisma.learning.findMany({
    where: { profileId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toLearning);
}

export async function getBundle(input: {
  profileId: string;
  surface: string;
  seed?: string;
  facts?: string;
  architecture?: string;
}): Promise<{ profile: Profile; bundle: string; golds: Gold[]; learnings: Learning[] }> {
  const [profile, golds, learnings] = await Promise.all([
    getProfile(input.profileId),
    listGolds(input.profileId),
    listLearnings(input.profileId),
  ]);
  const surface = profile.surfaces.find((item) => item.id === input.surface);
  return {
    profile,
    golds,
    learnings,
    bundle: formatToneBundle({
      guide: profile.guide,
      bannedForPrompt: profile.bannedForPrompt,
      surface,
      surfaceId: input.surface,
      seed: input.seed ?? input.surface,
      facts: input.facts,
      profileId: input.profileId,
      architecture: input.architecture,
      golds,
      learnings,
    }),
  };
}

export async function generateForProfile(input: {
  profileId: string;
  surface: string;
  facts: string;
  seed?: string;
  architecture?: string;
  format?: "blog" | "plain";
  model?: string;
}): Promise<{ body: string; retried: boolean; bundle: string; warnings: string[]; trace: DraftTrace }> {
  const corpus = await getBundle({
    profileId: input.profileId,
    surface: input.surface,
    seed: input.seed,
    facts: input.facts,
    architecture: input.architecture,
  });
  const model = input.model?.trim() || DRAFT_MODEL;
  return generateDraft(
    {
      profile: corpus.profile,
      surfaceId: input.surface,
      facts: input.facts,
      seed: input.seed ?? input.surface,
      golds: corpus.golds,
      learnings: corpus.learnings,
      architecture: input.architecture,
      format: input.format,
      model,
    },
    (prompt) => completeDraft({ ...prompt, model }),
  );
}

export async function learnForProfile(input: {
  profileId: string;
  before?: string;
  after?: string;
  why?: string;
  rule?: string;
  keepAsGold?: boolean;
  title?: string;
  surface?: string;
  architecture?: string;
  sourceDraftId?: string | null;
}): Promise<{ learningCount: number; keptGold: boolean; learnings: Learning[] }> {
  const stamp = new Date();
  const inferred = await inferPreference({
    before: input.before ?? "",
    after: input.after ?? "",
    why: input.why,
    existingRule: input.rule,
    surface: input.surface,
  });
  const derived = inferred && !isQuotedSnippetRule(inferred.rule) ? [inferred] : [];

  const existing = await prisma.learning.findMany({
    where: { profileId: input.profileId, status: "active" },
    select: { rule: true },
  });
  const seen = new Set(existing.map((row) => row.rule.toLowerCase()));
  let learningCount = 0;
  for (const item of derived) {
    const key = item.rule.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.learning.create({
      data: {
        id: uniqueId("tl", input.profileId, String(learningCount + 1)),
        profileId: input.profileId,
        rule: item.rule,
        status: "active",
        before: item.before,
        after: item.after,
        why: item.why,
        surface: input.surface ?? "",
        sourceDraftId: input.sourceDraftId ?? null,
        createdAt: stamp,
        updatedAt: stamp,
      },
    });
    learningCount += 1;
  }

  let keptGold = false;
  const after = input.after?.trim() ?? "";
  if (input.keepAsGold && after) {
    const golds = await prisma.gold.findMany({
      where: { profileId: input.profileId, status: "active" },
      select: { id: true, body: true, architecture: true },
    });
    const architecture = input.architecture?.trim() ?? "";
    const existing = golds.find((gold) => gold.body.trim() === after);
    if (existing) {
      if (architecture && existing.architecture !== architecture) {
        await prisma.gold.update({
          where: { id: existing.id },
          data: { architecture },
        });
      }
    } else {
      await prisma.gold.create({
        data: {
          id: uniqueId("gold", input.profileId, String(Date.now())),
          profileId: input.profileId,
          title: input.title?.trim() || "Kept example",
          body: after,
          rejected: rejectedFromApprove(input.before ?? "", after),
          source: `Kept ${iso(stamp).slice(0, 10)} as a gold example.`,
          surface: input.surface || "other",
          architecture,
          canonical: false,
          status: "active",
          createdAt: stamp,
        },
      });
      keptGold = true;
    }
  }

  return {
    learningCount,
    keptGold,
    learnings: await listLearnings(input.profileId),
  };
}

export async function dismissLearning(id: string): Promise<Learning> {
  try {
    const row = await prisma.learning.update({
      where: { id },
      data: { status: "dismissed", updatedAt: new Date() },
    });
    return toLearning(row);
  } catch {
    throw new Error(`Unknown learning: ${id}`);
  }
}

export async function dismissGold(id: string): Promise<Gold> {
  try {
    const row = await prisma.gold.update({
      where: { id },
      data: { status: "dismissed" },
    });
    return toGold(row);
  } catch {
    throw new Error(`Unknown gold: ${id}`);
  }
}

function uniqueId(...parts: string[]): string {
  const base = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
