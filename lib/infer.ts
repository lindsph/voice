/**
 * Latent preference induction for one teach.
 *
 * Backing: Gao et al., PRELUDE/CIPHER (NeurIPS 2024), Algorithm 1.
 * They only query the model to explain an edit when token edit distance > δ.
 * Explaining a tiny edit makes the model invent “no preference” or a fake rule.
 * They also showed context-agnostic continual infer (no retrieval) can raise
 * future edit cost vs no learning — retrieval is Step 2, not this file.
 *
 * Extra signal they did not have: a typed why. That is the preference. Do not
 * rewrite it. Fact-only edits (name, number, URL) are not style — reply NONE.
 */

import { completeWithOpenAi, type ChatComplete, unwrapDraft } from "./generate";
import { isQuotedSnippetRule, type DerivedLearning } from "./learn";

export { isQuotedSnippetRule } from "./learn";

const MAX_RULE = 160;

/** Word-level Levenshtein. CIPHER used token Levenshtein; we have no tokenizer here. */
export const MIN_TEACH_WORD_EDITS = 3;

export type PreferenceInput = {
  before?: string;
  after?: string;
  why?: string;
  existingRule?: string;
  surface?: string;
};

const INFER_SYSTEM = [
  "You turn a writing edit into ONE standing voice rule.",
  "Write a short preference the next draft should follow. Style and stance only.",
  "One sentence, under 160 characters.",
  "No quoted passages longer than six words.",
  "Do not name people, products, prices, URLs, or one-off facts.",
  "Do not say “Keep this voice” or paste the revised sentence.",
  "If the edit is only factual (a number, a name, a link) and not stylistic, reply NONE.",
].join(" ");

function clipRule(rule: string): string {
  return rule.replace(/\s+/g, " ").trim().slice(0, MAX_RULE);
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function wordEditDistance(before: string, after: string): number {
  const left = words(before);
  const right = words(after);
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = Array.from({ length: cols }, (__, j) => (i === 0 ? j : 0));
    row[0] = i;
    return row;
  });
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(
        grid[i - 1]![j]! + 1,
        grid[i]![j - 1]! + 1,
        grid[i - 1]![j - 1]! + cost,
      );
    }
  }
  return grid[left.length]![right.length]!;
}

function note(input: PreferenceInput): string {
  return input.why?.replace(/\s+/g, " ").trim() ?? "";
}

function providedRule(input: PreferenceInput): string {
  return input.existingRule?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * CIPHER: no LPI when the revision barely moved and the user wrote no why.
 * No agent draft (empty before) is not an edit — do not invent a Keep-this-voice.
 * An explicit rule from another app already passed that app’s teach gate.
 */
export function shouldWriteLearning(input: PreferenceInput): boolean {
  if (note(input).length >= 8) return true;
  const existing = providedRule(input);
  const before = input.before?.trim() ?? "";
  const after = input.after?.trim() ?? "";
  if (existing && (!before || !after)) return true;
  if (!before || !after || before === after) return false;
  return wordEditDistance(before, after) > MIN_TEACH_WORD_EDITS;
}

function evidence(input: PreferenceInput, fallback?: DerivedLearning): DerivedLearning {
  return {
    rule: "",
    before: fallback?.before || input.before?.trim() || "",
    after: fallback?.after || input.after?.trim() || "",
    why: note(input) || fallback?.why || "",
  };
}

/** Offline / no-LLM: why or an abstract rule. Never a pasted sentence. */
export function inferPreferenceHeuristic(input: PreferenceInput): DerivedLearning | null {
  if (!shouldWriteLearning(input)) return null;
  const base = evidence(input);
  const why = note(input);
  if (why.length >= 8) {
    const rule = clipRule(why);
    return isQuotedSnippetRule(rule) ? null : { ...base, rule };
  }

  const existing = providedRule(input);
  if (existing && !isQuotedSnippetRule(existing)) {
    return { ...base, rule: clipRule(existing) };
  }

  return null;
}

export function normalizeInferredRule(raw: string, after = ""): string | null {
  let rule = unwrapDraft(raw).replace(/^NONE\b\.?/i, "").trim();
  rule = clipRule(rule);
  if (rule.length < 8) return null;
  if (/^none$/i.test(rule)) return null;
  if (isQuotedSnippetRule(rule)) return null;
  if (after.trim()) {
    const afterFold = after.replace(/\s+/g, " ").trim().toLowerCase();
    const ruleFold = rule.toLowerCase();
    if (afterFold.length >= 24 && afterFold.includes(ruleFold) && ruleFold.length > 40) {
      return null;
    }
  }
  return rule;
}

function skipLlm(): boolean {
  return Boolean(process.env.VITEST) || process.env.VOICE_DISABLE === "1";
}

function inferUserPrompt(input: PreferenceInput): string {
  return [
    input.surface ? `Surface: ${input.surface}` : "",
    providedRule(input)
      ? `Suggested rule (abstract it if it quotes a sentence): ${providedRule(input)}`
      : "",
    input.before?.trim() ? `BEFORE:\n${input.before.trim().slice(0, 800)}` : "",
    input.after?.trim() ? `AFTER:\n${input.after.trim().slice(0, 800)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function needsLlm(input: PreferenceInput): boolean {
  if (note(input).length >= 8) return false;
  const existing = providedRule(input);
  if (existing && !isQuotedSnippetRule(existing)) return false;
  return true;
}

/** One standing preference. Snippets stay on the row as evidence, not as the rule. */
export async function inferPreference(
  input: PreferenceInput,
  complete?: ChatComplete,
): Promise<DerivedLearning | null> {
  if (!shouldWriteLearning(input)) return null;
  if (!needsLlm(input)) {
    return inferPreferenceHeuristic(input);
  }
  if (!complete && skipLlm()) {
    return inferPreferenceHeuristic(input);
  }

  const user = inferUserPrompt(input);
  if (!user) return inferPreferenceHeuristic(input);
  const run =
    complete ?? ((payload) => completeWithOpenAi({ ...payload, temperature: 0.2 }));

  try {
    const raw = await run({ system: INFER_SYSTEM, user });
    if (/^\s*NONE\b/i.test(unwrapDraft(raw))) return null;
    const rule = normalizeInferredRule(raw, input.after ?? "");
    if (!rule) return inferPreferenceHeuristic(input);
    const fallback = inferPreferenceHeuristic(input);
    return {
      rule,
      before: fallback?.before || input.before?.trim() || "",
      after: fallback?.after || input.after?.trim() || "",
      why: fallback?.why || note(input),
    };
  } catch {
    return inferPreferenceHeuristic(input);
  }
}
