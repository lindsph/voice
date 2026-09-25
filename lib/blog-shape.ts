/**
 * WoolGrown blog shape. Voice owns the parts of a post.
 * Command still checks citation ids and topic match.
 */

export const BLOG_SHAPE_INSTRUCTION = [
  "Return one JSON object and nothing else. No markdown fence.",
  "Shape of the post:",
  "- lead: an answer-first paragraph before any section",
  "- sections: at least two objects {heading, body}",
  "- faq: three to eight short {question, answer} items",
  "- cta: one soft close",
  "Also include title, slug, metaDescription, primaryQuestion, sourcesHeading, sourcesBody, citations, claimsReviewRequired, suggestedProducts, internalLinks.",
  "citations must be source ids copied from the facts. Do not invent ids.",
].join("\n");

type BlogJson = {
  lead?: unknown;
  sections?: unknown;
  faq?: unknown;
  cta?: unknown;
};

function asRecord(value: unknown): BlogJson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as BlogJson;
}

export function parseBlogJson(body: string): BlogJson | null {
  try {
    return asRecord(JSON.parse(body));
  } catch {
    return null;
  }
}

export function blogDraftIssues(body: string): string[] {
  const row = parseBlogJson(body);
  if (!row) {
    return ["Blog draft must be one JSON object with lead, sections, faq, and cta."];
  }
  const issues: string[] = [];
  if (typeof row.lead !== "string" || row.lead.trim().length < 40) {
    issues.push("lead must be an answer-first paragraph");
  }
  if (!Array.isArray(row.sections) || row.sections.length < 2) {
    issues.push("sections must include at least two");
  }
  const faq = Array.isArray(row.faq) ? row.faq : [];
  if (faq.length < 3 || faq.length > 8) {
    issues.push("faq must be three to eight short Q&A items");
  }
  if (typeof row.cta !== "string" || row.cta.trim().length < 20) {
    issues.push("cta must be one soft close");
  }
  return issues;
}

export function blogProse(body: string): string {
  const row = parseBlogJson(body);
  if (!row) return body;
  const parts: string[] = [];
  if (typeof row.lead === "string") parts.push(row.lead);
  if (Array.isArray(row.sections)) {
    for (const section of row.sections) {
      if (section && typeof section === "object" && "body" in section) {
        const text = (section as { body?: unknown }).body;
        if (typeof text === "string") parts.push(text);
      }
    }
  }
  if (Array.isArray(row.faq)) {
    for (const item of row.faq) {
      if (item && typeof item === "object" && "answer" in item) {
        const text = (item as { answer?: unknown }).answer;
        if (typeof text === "string") parts.push(text);
      }
    }
  }
  if (typeof row.cta === "string") parts.push(row.cta);
  return parts.join("\n");
}
