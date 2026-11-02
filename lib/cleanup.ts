/**
 * Clean-up pass: a second, editing-only call after a whole piece is drafted.
 * It fixes what the eval judge kept naming as AI in WoolGrown's first scored
 * run (2 Nov 2026, 21 drafts): em-dash asides and reveals, "it's not X, it's Y"
 * contrasts, stock framing lines, polished template headings, and drafts that
 * read smoother than she writes. Drafts ran 21 counted tells per 1,000 words
 * against her 13.
 *
 * A variant: only runs when a caller asks for it (eval candidate runs today).
 * The edit is kept only when it parses and counts no more tells than before.
 */

import { blogDraftIssues, parseBlogJson } from "./blog-shape";
import { countAntitheses, countEmDashes, findTricolons } from "./slop";

export const DRAFT_VARIANTS = ["cleanup"] as const;
export type DraftVariant = (typeof DRAFT_VARIANTS)[number];

type Complete = (input: { system: string; user: string }) => Promise<string>;

export function cleanupSystem(name: string): string {
  return [
    `You edit a draft so it reads like ${name} wrote it. Change as little as you can.`,
    "Keep every fact, number, name, link, product and the order of the piece. Do not add anything.",
    "Fix only these:",
    "1. Em-dashes: keep about one per 150 words. Turn the rest into a period, comma or colon. Step headings like “Step 1 — Water in” may keep theirs.",
    "2. “It's not X, it's Y” and “isn't X — it's Y” contrasts: say the plain thing instead.",
    "3. Lists of three used for rhythm: keep a list only when it names real things.",
    "4. Stock framing and hype: cut lines like “Here's a quick breakdown”, “A few things worth noting”, “This is the short version”, “It's a natural fit”, “No pressure, just conversation”, “We're excited”, and closing recaps of what the piece already said.",
    "5. Template headings like “Timeline / results”, “How to replicate”, “Before You Start”: replace with a short plain heading that says what the section is about.",
    "6. Do not polish. Plain, slightly uneven sentences are hers; do not make sentences more parallel, punchier or smoother.",
  ].join("\n");
}

const BLOG_FORMAT =
  "The draft is a JSON object. Edit only lead, sections (heading and body), faq answers and cta. Return the whole JSON object and nothing else. No markdown fence.";
const PLAIN_FORMAT = "Return only the edited draft. No preamble.";

/** Em-dashes, contrasts and lists of three in the reader-facing text. */
export function countedTells(text: string): number {
  return countEmDashes(text) + countAntitheses(text) + findTricolons(text).length;
}

function blogReaderProse(body: string): string {
  const row = parseBlogJson(body) as Record<string, unknown> | null;
  if (!row) return body;
  const parts: string[] = [];
  if (typeof row.lead === "string") parts.push(row.lead);
  for (const section of Array.isArray(row.sections) ? row.sections : []) {
    const s = section as { heading?: unknown; body?: unknown } | null;
    if (typeof s?.heading === "string") parts.push(s.heading);
    if (typeof s?.body === "string") parts.push(s.body);
  }
  for (const item of Array.isArray(row.faq) ? row.faq : []) {
    const answer = (item as { answer?: unknown } | null)?.answer;
    if (typeof answer === "string") parts.push(answer);
  }
  if (typeof row.cta === "string") parts.push(row.cta);
  return parts.join("\n\n");
}

/** The edited prose fields on the original post, so ids, links and products can't drift. */
export function mergeBlogEdit(original: string, edited: string): string | null {
  const before = parseBlogJson(original) as Record<string, unknown> | null;
  const after = parseBlogJson(edited) as Record<string, unknown> | null;
  if (!before || !after) return null;
  const merged: Record<string, unknown> = { ...before };
  if (typeof after.lead === "string") merged.lead = after.lead;
  if (Array.isArray(after.sections)) merged.sections = after.sections;
  if (typeof after.cta === "string") merged.cta = after.cta;
  if (Array.isArray(before.faq) && Array.isArray(after.faq) && after.faq.length === before.faq.length) {
    merged.faq = before.faq.map((item, i) => {
      const answer = (after.faq as Array<{ answer?: unknown } | null>)[i]?.answer;
      return item && typeof item === "object" && typeof answer === "string" ? { ...item, answer } : item;
    });
  }
  const body = JSON.stringify(merged);
  return blogDraftIssues(body).length === 0 ? body : null;
}

function unfence(text: string): string {
  return text
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** The cleaned draft, or the original when the edit breaks the shape or adds tells. Never throws. */
export async function cleanupDraft(
  input: { name: string; body: string; blog: boolean },
  complete: Complete,
): Promise<string> {
  try {
    const reply = unfence(
      await complete({
        system: cleanupSystem(input.name),
        user: `${input.blog ? BLOG_FORMAT : PLAIN_FORMAT}\n\n=== Draft ===\n${input.body}`,
      }),
    );
    const edited = input.blog ? mergeBlogEdit(input.body, reply) : reply;
    if (!edited) return input.body;
    const prose = (body: string) => (input.blog ? blogReaderProse(body) : body);
    return countedTells(prose(edited)) <= countedTells(prose(input.body)) ? edited : input.body;
  } catch (error) {
    console.error("Clean-up pass failed; keeping the draft", error);
    return input.body;
  }
}
