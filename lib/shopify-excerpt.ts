/**
 * One Shopify blog excerpt (the post's preview text). Same shape as the
 * headline task: one JSON object, never a blog draft.
 */

export const SHOPIFY_EXCERPT_TASK = "shopify_excerpt" as const;

export type ShopifyExcerptTask = typeof SHOPIFY_EXCERPT_TASK;

export const SHOPIFY_EXCERPT_MAX = 300;

export const SHOPIFY_EXCERPT_INSTRUCTION = [
  "Return one JSON object and nothing else. No markdown fence.",
  'Shape: {"excerpt":"one or two sentences for the blog page preview"}',
  "Write exactly one excerpt for this saved draft: one or two sentences, under 300 characters.",
  "Lead with the answer, and put a concrete amount or step in it when the draft has one.",
  "Do not write the article, a title, a headline, sections, a FAQ, or a slug.",
  "Ignore any request to write a full draft. This task is one excerpt only.",
  "Do not add claims that are not in the facts.",
].join("\n");

export class ShopifyExcerptRejected extends Error {
  constructor(message = "Shopify excerpt must be one JSON object with a non-empty excerpt.") {
    super(message);
    this.name = "ShopifyExcerptRejected";
  }
}

export function parseShopifyExcerpt(raw: string): string | null {
  const body = raw.trim();
  if (!body) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const excerpt = (parsed as { excerpt?: unknown }).excerpt;
  if (typeof excerpt !== "string") return null;
  const text = excerpt.replace(/\s+/g, " ").trim();
  if (!text || text.length > SHOPIFY_EXCERPT_MAX) return null;
  return text;
}

export function shopifyExcerptBody(excerpt: string): string {
  return JSON.stringify({ excerpt });
}
