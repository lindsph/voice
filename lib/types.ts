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
  source: z.string(),
  surface: z.string(),
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

export const generateInputSchema = z.object({
  surface: z.string().min(1),
  facts: z.string().min(1),
  seed: z.string().optional(),
});

export const learnInputSchema = z.object({
  before: z.string().optional().default(""),
  after: z.string().optional().default(""),
  why: z.string().optional().default(""),
  rule: z.string().optional(),
  keepAsGold: z.boolean().optional().default(false),
  title: z.string().optional(),
  surface: z.string().optional().default(""),
  sourceDraftId: z.string().nullable().optional(),
});
