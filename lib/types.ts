import { z } from "zod";

export const surfaceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  maxWords: z.number().nullable(),
  hint: z.string(),
});

export type Surface = z.infer<typeof surfaceSchema>;

export const goldSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  title: z.string(),
  body: z.string(),
  rejected: z.string().optional().default(""),
  source: z.string(),
  surface: z.string(),
  architecture: z.string().optional().default(""),
  canonical: z.boolean(),
  status: z.enum(["active", "dismissed"]),
  createdAt: z.string(),
});

export type Gold = z.infer<typeof goldSchema>;

export const learningSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  rule: z.string(),
  status: z.enum(["active", "dismissed"]),
  before: z.string(),
  after: z.string(),
  why: z.string(),
  surface: z.string(),
  kind: z.enum(["voice", "fact", "unknown"]).default("unknown"),
  classificationSource: z
    .enum(["same_call", "separate_call", "heuristic", "fallback"])
    .default("fallback"),
  classificationMismatch: z.boolean().default(false),
  sourceDraftId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Learning = z.infer<typeof learningSchema>;

export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  guide: z.string(),
  systemPrompt: z.string(),
  bannedForPrompt: z.array(z.string()),
  surfaces: z.array(surfaceSchema),
  updatedAt: z.string(),
});

export type Profile = z.infer<typeof profileSchema>;

export type DraftTraceGold = {
  id: string;
  title: string;
  reason: string;
};

export type DraftTraceLearning = {
  id: string;
  rule: string;
  reason: string;
  kind?: "voice" | "fact" | "unknown";
  classificationSource?: "same_call" | "separate_call" | "heuristic" | "fallback";
  classificationMismatch?: boolean;
};

/** Compact record of what a generate call actually used. IDs and counts, not the prompt. */
export type DraftTrace = {
  profileId: string;
  surfaceId: string;
  model: string;
  factsCharacterCount: number;
  selectedGoldIds: string[];
  selectedLearningIds: string[];
  bannedPhrasesChecked: string[];
  seed: string;
  architecture?: string;
  retryReason?: string;
  selectedGolds: DraftTraceGold[];
  selectedLearnings: DraftTraceLearning[];
};

export const generateInputSchema = z.object({
  surface: z.string().min(1),
  facts: z.string().min(1),
  seed: z.string().optional(),
  architecture: z.string().optional(),
  format: z.enum(["blog", "plain"]).optional(),
  model: z.string().optional(),
});

export const generationOutcomeSchema = z.enum(["pending", "kept", "edited", "rejected"]);

export type GenerationOutcome = z.infer<typeof generationOutcomeSchema>;

export type GenerationLogRow = {
  id: string;
  createdAt: string;
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
  outcome: GenerationOutcome;
  editedBody: string | null;
  userNote: string | null;
};

export const generationReviewSchema = z.object({
  outcome: z.enum(["kept", "edited", "rejected"]),
  editedBody: z.string().optional(),
  userNote: z.string().optional(),
});

export const learnInputSchema = z.object({
  before: z.string().optional().default(""),
  after: z.string().optional().default(""),
  why: z.string().optional().default(""),
  rule: z.string().optional(),
  keepAsGold: z.boolean().optional().default(false),
  title: z.string().optional(),
  surface: z.string().optional().default(""),
  architecture: z.string().optional().default(""),
  sourceDraftId: z.string().nullable().optional(),
  kind: z.enum(["voice", "fact", "unknown"]).optional(),
});
