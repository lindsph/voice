export type VoiceEdit = {
  before: string;
  after: string;
  why?: string;
};

export type DerivedLearning = {
  rule: string;
  before: string;
  after: string;
  why: string;
};

/** CIPHER wants a preference description, not the after-sentence in the prompt. */
export function isQuotedSnippetRule(rule: string): boolean {
  return /keep this voice|prefer\s+["“']|avoid phrasing like:/i.test(rule);
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

const MIN_SNIP = 24;
const MAX_RULE = 220;
const MAX_SNIP = 100;

export function sliceSnip(text: string, max = MAX_SNIP): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

export function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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

export function rulesFromEdit(input: VoiceEdit): DerivedLearning[] {
  const before = input.before.trim();
  const after = input.after.trim();
  const why = input.why?.replace(/\s+/g, " ").trim() ?? "";
  const out: DerivedLearning[] = [];

  if (why.length >= 8) {
    out.push({
      rule: `Editor note: ${why}`.slice(0, MAX_RULE),
      before: "",
      after: "",
      why,
    });
  }

  if (!after) return out;

  if (!before) {
    const hook = splitSentences(after)[0];
    if (hook && hook.length >= MIN_SNIP) {
      out.push({
        rule: `Keep this voice: "${sliceSnip(hook)}"`.slice(0, MAX_RULE),
        before: "",
        after: hook,
        why,
      });
    }
    return dedupeLearnings(out);
  }

  if (before === after) return dedupeLearnings(out);

  const prev = splitSentences(before);
  const next = splitSentences(after);
  const used = new Set<number>();

  for (const old of prev) {
    let best = -1;
    let bestScore = 0;
    next.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = tokenJaccard(old, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });

    if (best >= 0 && bestScore >= 0.92) {
      used.add(best);
      continue;
    }

    if (best >= 0 && bestScore >= 0.32 && next[best] !== old) {
      used.add(best);
      out.push({
        rule: `Prefer "${sliceSnip(next[best])}" over "${sliceSnip(old)}"`.slice(0, MAX_RULE),
        before: old,
        after: next[best],
        why,
      });
      continue;
    }

    if (old.length >= MIN_SNIP && (best < 0 || bestScore < 0.2)) {
      out.push({
        rule: `Avoid phrasing like: "${sliceSnip(old)}"`.slice(0, MAX_RULE),
        before: old,
        after: "",
        why,
      });
    }
  }

  next.forEach((candidate, index) => {
    if (used.has(index) || candidate.length < MIN_SNIP) return;
    out.push({
      rule: `Keep this voice: "${sliceSnip(candidate)}"`.slice(0, MAX_RULE),
      before: "",
      after: candidate,
      why,
    });
  });

  return dedupeLearnings(out).slice(0, 6);
}

function dedupeLearnings(items: DerivedLearning[]): DerivedLearning[] {
  const seen = new Set<string>();
  const out: DerivedLearning[] = [];
  for (const item of items) {
    const key = item.rule.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
