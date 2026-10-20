export type DerivedLearning = {
  rule: string;
  before: string;
  after: string;
  why: string;
  kind?: "voice" | "fact" | "unknown";
  classificationSource?: "same_call" | "separate_call" | "heuristic" | "fallback";
  classificationMismatch?: boolean;
};

/** CIPHER wants a preference description, not the after-sentence in the prompt. */
export function isQuotedSnippetRule(rule: string): boolean {
  return /keep this voice|prefer\s+["“']|avoid phrasing like:/i.test(rule);
}

const MIN_NOTE = 8;

function noteAfterQuote(match: RegExpMatchArray | null): string | null {
  if (!match) return null;
  const note = match[1]?.trim() ?? "";
  if (note.length < MIN_NOTE || isQuotedSnippetRule(note)) return null;
  return note;
}

/**
 * Quoted edits store and prompt as the note after the dash.
 * `Avoid: "…" — too salesy` → `too salesy`
 * `Keep this voice: "…" — too stiff` → `too stiff`
 * `Prefer "…" over "…" — name the place` → `name the place`
 * A quoted line with no real note is dropped. Other rules pass through.
 * Null means do not put this rule in the prompt.
 */
export function ruleForPrompt(rule: string): string | null {
  const text = rule.replace(/\s+/g, " ").trim();
  const quotedNote = noteAfterQuote(
    text.match(/^Avoid:\s*["“][\s\S]*["”]\s*—\s*(.*)$/i) ??
      text.match(/^Keep this voice:\s*["“][\s\S]*["”]\s*—\s*(.*)$/i) ??
      text.match(
        /^Prefer\s+["“][\s\S]*["”]\s+over\s+["“][\s\S]*["”]\s*—\s*(.*)$/i,
      ),
  );
  if (quotedNote) return quotedNote;
  if (
    /^Avoid:\s*["“]/i.test(text) ||
    /^Keep this voice:/i.test(text) ||
    /^Prefer\s+["“]/i.test(text)
  ) {
    return null;
  }
  if (isQuotedSnippetRule(text)) return null;
  return text;
}

/**
 * Pair for later DPO: approved body vs the raw generate.
 * CIPHER’s ICL-edit baseline put this rejected text in the next prompt and
 * lost. We store the pair. We do not inject it.
 */
export function rejectedFromApprove(before: string, after: string): string {
  const raw = before.trim();
  const kept = after.trim();
  if (!raw || !kept || raw === kept) return "";
  return raw;
}

export function tokenJaccard(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / (left.size + right.size - overlap);
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}
