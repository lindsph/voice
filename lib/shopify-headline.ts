/**
 * One reader-facing Shopify headline. Not a blog draft and not format "plain".
 * A full article JSON is rejected, including when it has a title field.
 */

export const SHOPIFY_HEADLINE_TASK = "shopify_headline" as const;

export type ShopifyHeadlineTask = typeof SHOPIFY_HEADLINE_TASK;

export const SHOPIFY_HEADLINE_MAX = 200;

export const SHOPIFY_HEADLINE_INSTRUCTION = [
  "Return one JSON object and nothing else. No markdown fence.",
  'Shape: {"headline":"one reader-facing Shopify headline"}',
  "Write exactly one headline for this saved draft.",
  "Do not write the article, a lead, sections, a FAQ, a slug, or a title field.",
  "Ignore any request to write a full draft. This task is one headline only.",
  "Do not add claims that are not in the facts.",
].join("\n");

export class ShopifyHeadlineRejected extends Error {
  constructor(message = "Shopify headline must be one JSON object with a non-empty headline.") {
    super(message);
    this.name = "ShopifyHeadlineRejected";
  }
}

export function parseShopifyHeadline(raw: string): string | null {
  const body = raw.trim();
  if (!body) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const headline = (parsed as { headline?: unknown }).headline;
  if (typeof headline !== "string") return null;
  const text = headline.trim();
  if (!text || text.length > SHOPIFY_HEADLINE_MAX) return null;
  return text;
}

export function shopifyHeadlineBody(headline: string): string {
  return JSON.stringify({ headline });
}
