/**
 * Checks a newly learned rule before it goes live, so only real conflicts need
 * a person: a duplicate of a live rule is merged, a contradiction or a rule that
 * loosens the claims posture is held, and anything else goes live as today.
 *
 * Prototype: not wired into saving yet (see the voice-rule-self-check card).
 */

import { unwrapDraft, type ChatComplete } from "./generate";

export type RuleVerdict =
  | { verdict: "new"; reason: string }
  | { verdict: "duplicate" | "conflict"; ruleId: string; reason: string }
  | { verdict: "claims"; reason: string };

export type LiveRule = { id: string; rule: string };

const CLAIMS_HEADINGS = ["### How we make claims", "## Claims posture"];

/** The guide's claims sections, each up to the next heading of the same or higher level. */
export function claimsSections(guide: string): string {
  return CLAIMS_HEADINGS.map((heading) => {
    const start = guide.indexOf(heading);
    if (start === -1) return "";
    const level = heading.split(" ")[0]!.length;
    const rest = guide.slice(start + heading.length);
    const next = rest.search(new RegExp(`\\n#{1,${level}} `));
    return guide.slice(start, start + heading.length + (next === -1 ? rest.length : next)).trim();
  })
    .filter(Boolean)
    .join("\n\n");
}

export function buildRuleCheckPrompt(input: {
  rule: string;
  surface: string;
  live: LiveRule[];
  claims: string;
}): { system: string; user: string } {
  const system = [
    "You check one new writing rule against the rules already in use, before it is added.",
    'Return one JSON object and nothing else: {"verdict":"new"|"duplicate"|"conflict"|"claims","ruleId":"…","reason":"…"}.',
    "duplicate: a live rule already asks for the same thing (wording may differ). Give its ruleId.",
    "conflict: following the new rule would break a live rule, or the reverse. Give its ruleId.",
    "claims: the new rule would make drafts state more than the claims policy allows (estimates, figures, results, stronger certainty).",
    "new: none of these. A rule that only adds detail to a live one is new.",
    "Check in that order and return the first that applies. reason is one short sentence.",
  ].join("\n");
  const user = [
    `Surface: ${input.surface || "any"}`,
    "",
    `New rule: ${input.rule}`,
    "",
    "Live rules:",
    ...(input.live.length > 0 ? input.live.map((item) => `- [${item.id}] ${item.rule}`) : ["(none)"]),
    "",
    "Claims policy:",
    input.claims || "(none)",
  ].join("\n");
  return { system, user };
}

/** The verdict from the model's JSON. Anything unreadable, or a ruleId that is not live, is null. */
export function parseRuleVerdict(text: string, live: LiveRule[]): RuleVerdict | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapDraft(text));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { verdict, ruleId, reason } = parsed as Record<string, unknown>;
  const why = typeof reason === "string" ? reason.trim() : "";
  if (verdict === "new" || verdict === "claims") return { verdict, reason: why };
  if (verdict === "duplicate" || verdict === "conflict") {
    if (typeof ruleId !== "string" || !live.some((item) => item.id === ruleId)) return null;
    return { verdict, ruleId, reason: why };
  }
  return null;
}

/** A failed or unreadable check lets the rule go live, which is what happens today. */
export async function checkNewRule(
  input: { rule: string; surface: string; live: LiveRule[]; guide: string },
  complete: ChatComplete,
): Promise<RuleVerdict> {
  const live = input.live.filter((item) => item.rule.trim());
  if (live.length === 0 && !claimsSections(input.guide)) return { verdict: "new", reason: "Nothing to check against." };
  try {
    const prompt = buildRuleCheckPrompt({ ...input, live, claims: claimsSections(input.guide) });
    const text = await complete({ ...prompt, effort: "low" });
    return parseRuleVerdict(text, live) ?? { verdict: "new", reason: "Check unreadable; kept as today." };
  } catch {
    return { verdict: "new", reason: "Check failed; kept as today." };
  }
}
