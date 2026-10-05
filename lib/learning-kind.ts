import { z } from "zod";

export const LEARNING_KINDS = ["voice", "fact", "unknown"] as const;

export type LearningKind = (typeof LEARNING_KINDS)[number];

export function isLearningKind(value: unknown): value is LearningKind {
  return value === "voice" || value === "fact" || value === "unknown";
}

const FACT_CUES = [
  /\bclaims?\b/i,
  /\bcitations?\b/i,
  /\bsources?\b/i,
  /\bstud(?:y|ies)\b/i,
  /\bstatistics?\b/i,
  /\bevidence\b/i,
  /\baccuracy\b/i,
  /\bunsupported\b/i,
  /\bprohibited\b/i,
  /\bnumbers?\b/i,
  /\bpercent(?:age)?s?\b/i,
  /\bdo not claim\b/i,
  /\bdon't claim\b/i,
  /\bdo not say\b/i,
  /\bdon't say\b/i,
  /\ballowed to say\b/i,
  /\bkill all\b/i,
  /\bkills all\b/i,
];

const VOICE_CUES = [
  /\btone\b/i,
  /\bopenings?\b/i,
  /\bwarmth\b/i,
  /\bdirectness\b/i,
  /\bformality\b/i,
  /\bformal\b/i,
  /\bpersona\b/i,
  /\bidentity\b/i,
  /\bsentences?\b/i,
  /\bword choice\b/i,
  /\bformatting\b/i,
  /\bintroduce yourself\b/i,
  /\baddress the reader\b/i,
  /\bopen like\b/i,
  /\bhow (?:it|the writing) should sound\b/i,
];

function cueHits(text: string, cues: RegExp[]): number {
  return cues.reduce((count, cue) => count + (cue.test(text) ? 1 : 0), 0);
}

/** Local fallback when the inference call does not return a kind. */
export function classifyLearningKind(rule: string): LearningKind {
  const text = rule.replace(/\s+/g, " ").trim();
  if (!text) return "unknown";
  const fact = cueHits(text, FACT_CUES);
  const voice = cueHits(text, VOICE_CUES);
  if (fact > 0 && voice === 0) return "fact";
  if (voice > 0 && fact === 0) return "voice";
  return "unknown";
}

/** A caller-supplied kind wins. A missing or failed classification is unknown. */
export function resolveLearningKind(supplied: unknown, inferred: unknown): LearningKind {
  if (isLearningKind(supplied)) return supplied;
  if (isLearningKind(inferred)) return inferred;
  return "unknown";
}

export const CLASSIFICATION_SOURCES = ["same_call", "separate_call", "heuristic", "fallback"] as const;

export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

export function isClassificationSource(value: unknown): value is ClassificationSource {
  return (
    value === "same_call" ||
    value === "separate_call" ||
    value === "heuristic" ||
    value === "fallback"
  );
}

/** Kind is accepted only when the whole classification object is valid. */
export const classificationSchema = z.object({
  rule: z.string().min(1),
  kind: z.enum(LEARNING_KINDS),
});

const kindOnlySchema = z.object({
  kind: z.enum(LEARNING_KINDS),
  rule: z.string().optional(),
});

export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True for the same words. A paraphrase is not the same rule. */
export function isSubstantivelySame(expected: string, returned: string): boolean {
  const left = normalizeForCompare(expected);
  const right = normalizeForCompare(returned);
  if (!left || !right) return false;
  if (left === right) return true;
  return right.includes(left) || left.includes(right);
}

export type SettledClassification = {
  rule: string;
  kind: LearningKind;
  classificationSource: ClassificationSource;
  classificationMismatch: boolean;
};

/**
 * The rule already produced by inference is the one we save.
 * The model may supply a kind. It may not replace the rule.
 */
export function settleClassification(input: {
  expectedRule: string;
  raw: unknown;
  source: "same_call" | "separate_call";
}): SettledClassification {
  const parsed = classificationSchema.safeParse(input.raw);
  const kindOnly = kindOnlySchema.safeParse(input.raw);
  const returnedRule = ruleText(input.raw);
  const classificationMismatch = Boolean(
    returnedRule && !isSubstantivelySame(input.expectedRule, returnedRule),
  );
  if (classificationMismatch) {
    console.warn("classification_mismatch", {
      expected: input.expectedRule,
      returned: returnedRule,
    });
  }
  const kind = parsed.success ? parsed.data.kind : kindOnly.success ? kindOnly.data.kind : "unknown";
  return {
    rule: input.expectedRule,
    kind,
    classificationSource: parsed.success || kindOnly.success ? input.source : "fallback",
    classificationMismatch,
  };
}

function ruleText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || !("rule" in raw)) return null;
  const rule = (raw as { rule?: unknown }).rule;
  return typeof rule === "string" && rule.trim() ? rule : null;
}
