import { Prisma } from "@prisma/client";

import { prisma } from "./db";
import type { DraftTrace, GenerationLogRow, GenerationOutcome } from "./types";

const NOTE_LIMIT = 280;
const RECENT_LIMIT = 40;

export type GenerationLogInput = {
  profileId: string;
  surfaceId: string;
  architecture?: string;
  seed?: string;
  model?: string;
  facts: string;
  generatedBody: string;
  selectedGoldIds: string[];
  selectedLearningIds: string[];
  warnings: string[];
  retried: boolean;
  retryReason?: string;
};

export function generationLogData(input: GenerationLogInput) {
  const architecture = input.architecture?.trim() || null;
  const seed = input.seed?.trim() || null;
  return {
    profileId: input.profileId,
    surfaceId: input.surfaceId,
    architecture,
    seed,
    model: input.model?.trim() || null,
    facts: input.facts,
    generatedBody: input.generatedBody,
    selectedGoldIds: input.selectedGoldIds,
    selectedLearningIds: input.selectedLearningIds,
    warnings: input.warnings,
    retried: input.retried,
    retryReason: input.retryReason?.trim() || null,
  };
}

export function generationLogInput(input: {
  profileId: string;
  surface: string;
  architecture?: string;
  seed?: string;
  facts: string;
  result: {
    body: string;
    retried: boolean;
    warnings: string[];
    trace: DraftTrace;
  };
}): GenerationLogInput {
  return {
    profileId: input.profileId,
    surfaceId: input.surface,
    architecture: input.architecture,
    seed: input.seed ?? input.surface,
    model: input.result.trace.model,
    facts: input.facts,
    generatedBody: input.result.body,
    selectedGoldIds: input.result.trace.selectedGoldIds,
    selectedLearningIds: input.result.trace.selectedLearningIds,
    warnings: input.result.warnings,
    retried: input.result.retried,
    retryReason: input.result.trace.retryReason,
  };
}

/** Write after the draft exists. A database miss must not change the draft. */
export async function logGeneration(input: GenerationLogInput): Promise<void> {
  try {
    await prisma.generationLog.create({ data: generationLogData(input) });
  } catch (error) {
    console.error("Failed to log generation", error);
  }
}

export function formatGenerationStamp(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function asOutcome(value: string): GenerationOutcome {
  if (value === "kept" || value === "edited" || value === "rejected" || value === "pending") {
    return value;
  }
  return "pending";
}

function toRow(row: {
  id: string;
  createdAt: Date;
  profileId: string;
  surfaceId: string;
  architecture: string | null;
  seed: string | null;
  model: string | null;
  facts: string;
  generatedBody: string;
  selectedGoldIds: string[];
  selectedLearningIds: string[];
  warnings: string[];
  retried: boolean;
  retryReason: string | null;
  outcome: string;
  editedBody: string | null;
  userNote: string | null;
}): GenerationLogRow {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    profileId: row.profileId,
    surfaceId: row.surfaceId,
    architecture: row.architecture,
    seed: row.seed,
    model: row.model,
    facts: row.facts,
    generatedBody: row.generatedBody,
    selectedGoldIds: row.selectedGoldIds,
    selectedLearningIds: row.selectedLearningIds,
    warnings: row.warnings,
    retried: row.retried,
    retryReason: row.retryReason,
    outcome: asOutcome(row.outcome),
    editedBody: row.editedBody,
    userNote: row.userNote,
  };
}

/** One count per draft that included the gold. Every logged draft, not the recent list. */
export async function countDraftsByGold(profileId: string): Promise<Record<string, number>> {
  const rows = await prisma.generationLog.findMany({
    where: { profileId },
    select: { selectedGoldIds: true },
  });
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const id of new Set(row.selectedGoldIds)) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

export async function listGenerationLogs(profileId: string): Promise<GenerationLogRow[]> {
  const rows = await prisma.generationLog.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
  });
  return rows.map(toRow);
}

export async function updateGenerationOutcome(
  id: string,
  input: { outcome: "kept" | "edited" | "rejected"; editedBody?: string; userNote?: string },
): Promise<GenerationLogRow> {
  const editedBody = input.editedBody?.trim() ?? "";
  if (input.outcome === "edited" && !editedBody) {
    throw new Error("Add the edited draft.");
  }
  const note = input.userNote?.trim() ?? "";
  try {
    const row = await prisma.generationLog.update({
      where: { id },
      data: {
        outcome: input.outcome,
        editedBody: input.outcome === "edited" ? editedBody : null,
        userNote: note ? note.slice(0, NOTE_LIMIT) : null,
      },
    });
    return toRow(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new Error(`Unknown generation: ${id}`);
    }
    throw error;
  }
}
