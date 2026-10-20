import { prisma } from "./db";
import { formatToneBundle } from "./bundle";
import { generationLogInput, logGeneration } from "./generation-log";
import { completeDraft, craftedApplies, CRAFTED_EFFORT, DRAFT_MODEL, generateDraft } from "./generate";
import { inferPreference } from "./infer";
import {
  isClassificationSource,
  isLearningKind,
  resolveLearningKind,
} from "./learning-kind";
import { planGoldSetSync, type GoldSetItem } from "./gold-set";
import { GUIDE_EXAMPLES_SOURCE, guideExampleParagraphs } from "./guide-examples";
import { goldTitleFromPassage, herWritingSource } from "./her-writing";
import { isQuotedSnippetRule, rejectedFromApprove } from "./learn";
import { decideNewRule, ruleCheckEnabled, type RuleVerdict } from "./rule-check";
import type { DraftTrace, Gold, GoldUpdate, Learning, Profile, Surface } from "./types";

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
  kind: string;
  classificationSource: string;
  classificationMismatch: boolean;
  sourceDraftId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Learning {
  return {
    id: row.id,
    profileId: row.profileId,
    rule: row.rule,
    // blocked, merged and retired rules are held back from prompts like dismissed ones.
    status: row.status === "active" ? "active" : "dismissed",
    before: row.before,
    after: row.after,
    why: row.why,
    surface: row.surface,
    kind: isLearningKind(row.kind) ? row.kind : "unknown",
    classificationSource: isClassificationSource(row.classificationSource)
      ? row.classificationSource
      : "fallback",
    classificationMismatch: row.classificationMismatch,
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
  task?: "shopify_headline" | "shopify_excerpt";
  model?: string;
  style?: "plain" | "crafted";
  /** Host-sent tone guide. Wins over the stored copy, which is refreshed to match. */
  guide?: string;
}): Promise<{
  body: string;
  retried: boolean;
  bundle: string;
  warnings: string[];
  trace: DraftTrace;
  /** GenerationLog id; the host PATCHes /api/generations/:id with what she kept. Null if logging failed. */
  generationId: string | null;
}> {
  const corpus = await getBundle({
    profileId: input.profileId,
    surface: input.surface,
    seed: input.seed,
    facts: input.facts,
    architecture: input.architecture,
  });
  const model = input.model?.trim() || DRAFT_MODEL;
  const sentGuide = input.guide?.trim() ?? "";
  const profile = sentGuide ? { ...corpus.profile, guide: sentGuide } : corpus.profile;
  if (sentGuide && sentGuide !== corpus.profile.guide.trim()) {
    // Keep the stored copy (shown on Voice's page, used as a fallback) in step.
    try {
      await updateGuide(input.profileId, sentGuide);
    } catch (error) {
      console.error("Failed to refresh stored guide", error);
    }
    try {
      await syncGuideExamples(input.profileId, sentGuide);
    } catch (error) {
      console.error("Failed to sync the guide's example paragraphs", error);
    }
  }
  const result = await generateDraft(
    {
      profile,
      surfaceId: input.surface,
      facts: input.facts,
      seed: input.seed ?? input.surface,
      golds: corpus.golds,
      learnings: corpus.learnings,
      architecture: input.architecture,
      format: input.format,
      task: input.task,
      model,
      style: input.style,
    },
    (prompt) =>
      completeDraft({
        ...prompt,
        model,
        effort: prompt.effort ?? (craftedApplies(input) ? CRAFTED_EFFORT : undefined),
      }),
  );
  let generationId: string | null = null;
  try {
    generationId = await logGeneration(
      generationLogInput({
        profileId: input.profileId,
        surface: input.surface,
        architecture: input.architecture,
        seed: input.seed,
        facts: input.facts,
        result,
      }),
    );
  } catch (error) {
    console.error("Failed to log generation", error);
  }
  return { ...result, generationId };
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
  kind?: "voice" | "fact" | "unknown";
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
    select: { id: true, rule: true, surface: true },
  });
  const seen = new Set(existing.map((row) => row.rule.toLowerCase()));
  let learningCount = 0;
  for (const item of derived) {
    const key = item.rule.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const verdict = await checkRuleBeforeSaving({
      profileId: input.profileId,
      surface: input.surface ?? "",
      rule: item.rule,
      live: existing,
    });
    await prisma.learning.create({
      data: {
        id: uniqueId("tl", input.profileId, String(learningCount + 1)),
        profileId: input.profileId,
        rule: item.rule,
        ...ruleCheckFields(verdict, stamp),
        before: item.before,
        after: item.after,
        why: item.why,
        surface: input.surface ?? "",
        kind: resolveLearningKind(input.kind, item.kind ?? "unknown"),
        classificationSource: item.classificationSource ?? "fallback",
        classificationMismatch: item.classificationMismatch ?? false,
        sourceDraftId: input.sourceDraftId ?? null,
        createdAt: stamp,
        updatedAt: stamp,
      },
    });
    if (verdict.verdict === "conflict") {
      // The newer rule wins; the old one is retired, not deleted, so Undo can bring it back.
      await prisma.learning.update({
        where: { id: verdict.ruleId },
        data: { status: "retired", updatedAt: stamp },
      });
    }
    if (verdict.verdict === "new" || verdict.verdict === "conflict") learningCount += 1;
  }

  let keptGold = false;
  const after = input.after?.trim() ?? "";
  if (input.keepAsGold && after) {
    // Every status: a gold she dismissed stays dismissed when the weekly
    // live-post sync sends the same sentence again.
    const golds = await prisma.gold.findMany({
      where: { profileId: input.profileId },
      select: { id: true, body: true, architecture: true, status: true },
    });
    const architecture = input.architecture?.trim() ?? "";
    const existing = golds.find((gold) => gold.body.trim() === after);
    if (existing?.status === "dismissed") {
      // Leave it dismissed; nothing new to keep.
    } else if (existing) {
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

export async function addHerWriting(input: {
  profileId: string;
  passages: string[];
  sourceTitle: string;
  surface: string;
}): Promise<{ added: number; skipped: number }> {
  const profile = await getProfile(input.profileId);
  const surface = input.surface.trim();
  if (!profile.surfaces.some((item) => item.id === surface)) {
    throw new Error("Pick a surface.");
  }
  const source = herWritingSource(input.sourceTitle);
  const existing = await prisma.gold.findMany({
    where: { profileId: input.profileId, status: "active" },
    select: { body: true },
  });
  const seen = new Set(existing.map((gold) => gold.body.trim()));
  const stamp = new Date();
  let added = 0;
  let skipped = 0;
  for (const passage of input.passages) {
    const body = passage.trim();
    if (!body || seen.has(body)) {
      skipped += 1;
      continue;
    }
    seen.add(body);
    await prisma.gold.create({
      data: {
        id: uniqueId("her", input.profileId, String(added + 1)),
        profileId: input.profileId,
        title: goldTitleFromPassage(body),
        body,
        rejected: "",
        source,
        surface,
        architecture: "",
        canonical: false,
        status: "active",
        createdAt: stamp,
      },
    });
    added += 1;
  }
  return { added, skipped };
}

/**
 * Keep the guide's approved example paragraphs as blog golds. A guide with no
 * example section changes nothing, so dropping the section by accident can't
 * dismiss them all.
 */
export async function syncGuideExamples(profileId: string, guide: string) {
  const items = guideExampleParagraphs(guide);
  if (items.length === 0) return null;
  return syncGoldSet({ profileId, surface: "blog", source: GUIDE_EXAMPLES_SOURCE, items });
}

/** Make the host's set of golds (one source, one surface) match `items`. */
export async function syncGoldSet(input: {
  profileId: string;
  surface: string;
  source: string;
  items: GoldSetItem[];
}): Promise<{ added: number; kept: number; retitled: number; dismissed: number }> {
  const profile = await getProfile(input.profileId);
  if (!profile.surfaces.some((item) => item.id === input.surface)) {
    throw new Error(`Unknown surface: ${input.surface}`);
  }
  const existing = await prisma.gold.findMany({
    where: { profileId: input.profileId },
    select: { id: true, body: true, title: true, source: true, surface: true, status: true },
  });
  const plan = planGoldSetSync({
    existing: existing.map((gold) => ({ ...gold, status: gold.status === "dismissed" ? "dismissed" : "active" })),
    items: input.items,
    source: input.source,
    surface: input.surface,
  });
  const stamp = new Date();
  await prisma.$transaction([
    ...plan.add.map((item, index) =>
      prisma.gold.create({
        data: {
          id: uniqueId("gold", input.profileId, input.surface, String(index + 1)),
          profileId: input.profileId,
          title: item.title,
          body: item.body,
          rejected: "",
          source: input.source,
          surface: input.surface,
          architecture: "",
          canonical: false,
          status: "active",
          createdAt: stamp,
        },
      }),
    ),
    ...plan.retitle.map((item) => prisma.gold.update({ where: { id: item.id }, data: { title: item.title } })),
    ...plan.dismiss.map((id) => prisma.gold.update({ where: { id }, data: { status: "dismissed" } })),
  ]);
  return { added: plan.add.length, kept: plan.keep, retitled: plan.retitle.length, dismissed: plan.dismiss.length };
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

export async function updateGold(id: string, input: GoldUpdate): Promise<Gold> {
  const data: { canonical?: boolean; body?: string; surface?: string; architecture?: string } = {};
  if (typeof input.canonical === "boolean") data.canonical = input.canonical;
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) throw new Error("Add the gold text.");
    data.body = body;
  }
  if (input.surface !== undefined) {
    const surface = input.surface.trim();
    if (!surface) throw new Error("Pick a surface.");
    data.surface = surface;
  }
  if (input.architecture !== undefined) data.architecture = input.architecture.trim();
  if (Object.keys(data).length === 0) throw new Error("Nothing to change.");
  try {
    const row = await prisma.gold.update({ where: { id }, data });
    return toGold(row);
  } catch (error) {
    if (error instanceof Error && (error.message === "Add the gold text." || error.message === "Pick a surface." || error.message === "Nothing to change.")) {
      throw error;
    }
    throw new Error(`Unknown gold: ${id}`);
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

/**
 * The rule check for one new rule, against the live rules that reach the same
 * prompts (same surface, or no surface). Off in tests and when Voice's model
 * calls are disabled, so the rule goes live as before.
 */
async function checkRuleBeforeSaving(input: {
  profileId: string;
  surface: string;
  rule: string;
  live: Array<{ id: string; rule: string; surface: string }>;
}): Promise<RuleVerdict> {
  if (!ruleCheckEnabled()) return { verdict: "new", reason: "" };
  const profile = await prisma.profile.findUnique({ where: { id: input.profileId }, select: { guide: true } });
  const live = input.live
    .filter((row) => !row.surface || !input.surface || row.surface === input.surface)
    .map((row) => ({ id: row.id, rule: row.rule }));
  return decideNewRule(
    { rule: input.rule, surface: input.surface, live, guide: profile?.guide ?? "" },
    (prompt) => completeDraft(prompt),
  );
}

/** Status and change fields for a rule the check sorted. A plain new rule gets neither. */
export function ruleCheckFields(verdict: RuleVerdict, at: Date) {
  if (verdict.verdict === "new") return { status: "active" as const };
  const action = RULE_ACTION[verdict.verdict];
  return {
    status: action === "replaced" ? ("active" as const) : action,
    autoAction: action,
    autoReason: verdict.reason,
    autoTargetId: "ruleId" in verdict ? verdict.ruleId : null,
    autoAt: at,
  };
}

const RULE_ACTION = { duplicate: "merged", claims: "blocked", conflict: "replaced" } as const;

export type RuleChangeAction = (typeof RULE_ACTION)[keyof typeof RULE_ACTION];

export type RuleChange = {
  id: string;
  rule: string;
  surface: string;
  action: RuleChangeAction;
  reason: string;
  /** The live rule it duplicated or replaced. */
  target: { id: string; rule: string } | null;
  before: string;
  after: string;
  why: string;
  at: string;
  undoneAt: string | null;
};

function isRuleChangeAction(value: string | null): value is RuleChangeAction {
  return value === "merged" || value === "blocked" || value === "replaced";
}

/** What the rule check changed in the last `days` days, newest first. */
export async function listRuleChanges(profileId: string, days = 7): Promise<RuleChange[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.learning.findMany({
    where: { profileId, autoAt: { gte: since } },
    orderBy: { autoAt: "desc" },
  });
  const targetIds = rows.map((row) => row.autoTargetId).filter((id): id is string => Boolean(id));
  const targets = targetIds.length
    ? await prisma.learning.findMany({ where: { id: { in: targetIds } }, select: { id: true, rule: true } })
    : [];
  const byId = new Map(targets.map((row) => [row.id, row]));
  return rows.flatMap((row) =>
    isRuleChangeAction(row.autoAction)
      ? [
          {
            id: row.id,
            rule: row.rule,
            surface: row.surface,
            action: row.autoAction,
            reason: row.autoReason,
            target: row.autoTargetId ? (byId.get(row.autoTargetId) ?? null) : null,
            before: row.before,
            after: row.after,
            why: row.why,
            at: iso(row.autoAt ?? row.createdAt),
            undoneAt: row.undoneAt ? iso(row.undoneAt) : null,
          },
        ]
      : [],
  );
}

/**
 * Undo one automatic change. A held rule (blocked or merged) goes live; a
 * replacement is reversed, so the old rule is live again and the new one is
 * dismissed. Undoing twice changes nothing.
 */
export async function undoRuleChange(id: string): Promise<RuleChangeAction> {
  const row = await prisma.learning.findUnique({ where: { id } });
  if (!row || !isRuleChangeAction(row.autoAction)) throw new Error(`Not an automatic change: ${id}`);
  if (row.undoneAt) return row.autoAction;
  const now = new Date();
  if (row.autoAction === "replaced") {
    await prisma.$transaction([
      prisma.learning.update({ where: { id }, data: { status: "dismissed", undoneAt: now, updatedAt: now } }),
      ...(row.autoTargetId
        ? [prisma.learning.update({ where: { id: row.autoTargetId }, data: { status: "active", updatedAt: now } })]
        : []),
    ]);
  } else {
    await prisma.learning.update({ where: { id }, data: { status: "active", undoneAt: now, updatedAt: now } });
  }
  return row.autoAction;
}
