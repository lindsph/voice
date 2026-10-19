/**
 * A host's tone guide can end with approved example paragraphs:
 *
 *   ## Example paragraphs …
 *   ### Field proof over time
 *   > Garden wool update — 8 months later. …
 *
 * Voice keeps those as blog golds, in step with the guide: when the host sends
 * a changed guide, paragraphs added there are added, ones removed there are
 * dismissed, and a gold she dismissed in Voice is never brought back.
 */

/** Names the gold set. Only golds with this source are added or dismissed by the guide. */
export const GUIDE_EXAMPLES_SOURCE = "Example paragraph in the tone guide (kept in step)";

export function guideExampleParagraphs(guide: string): Array<{ title: string; body: string }> {
  const lines = guide.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^## Example paragraphs\b/.test(line));
  if (start === -1) return [];
  const out: Array<{ title: string; body: string }> = [];
  let title = "";
  let quote: string[] = [];
  const flush = () => {
    const body = quote.join(" ").replace(/\s+/g, " ").trim();
    if (body) out.push({ title: title || body.split(/[.!?]/)[0]!.slice(0, 52), body });
    quote = [];
  };
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    if (/^### /.test(line)) {
      flush();
      title = line.replace(/^###\s+/, "").trim();
      continue;
    }
    if (/^>/.test(line)) {
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (quote.length) flush();
  }
  flush();
  return out;
}
