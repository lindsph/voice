/** Turn writing she already did into short gold examples. Not a learning. */

export const HER_WRITING_MAX = 24;
export const HER_WRITING_MIN_CHARS = 32;
export const HER_WRITING_MAX_CHARS = 360;

const MASTHEAD =
  /woolgrowncompany@|shopwoolgrown\.com|100%\s*natural|made in canada|^\s*woolgrown\s*$/i;

const VERB =
  /\b(is|are|use|uses|mix|mixes|water|waters|apply|applies|spread|spreads|keep|keeps|add|adds|soak|soaks|cover|covers|check|checks|hold|holds|break|breaks|release|releases|absorb|absorbs|swell|swells|leave|leaves|follow|follows|distribute|distributes|work|works|help|helps|retain|retains|become|becomes|position|backfill)\b/i;

export function passagesFromHerWriting(raw: string): string[] {
  const paragraphs = raw
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const paragraph of paragraphs) {
    const pieces = paragraph.split(/\s*[•●]\s+|(?<=[.?!])\s+/);
    for (const piece of pieces) {
      const sentence = piece.replace(/^[\d]+[.)]\s+/, "").trim();
      if (!keepSentence(sentence)) continue;
      const key = sentence.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(sentence);
      if (kept.length >= HER_WRITING_MAX) return kept;
    }
  }
  return kept;
}

export function goldTitleFromPassage(body: string): string {
  const words = body
    .replace(/[.?!].*$/, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
  return words.length > 52 ? `${words.slice(0, 52).trimEnd()}…` : words;
}

export function herWritingSource(title: string): string {
  const name = title.replace(/\s+/g, " ").trim();
  return name ? `Her writing — ${name}` : "Her writing";
}

function keepSentence(sentence: string): boolean {
  if (sentence.length < HER_WRITING_MIN_CHARS || sentence.length > HER_WRITING_MAX_CHARS) {
    return false;
  }
  if (MASTHEAD.test(sentence)) return false;
  if (/^\d/.test(sentence)) return false;
  const titleWords = sentence.match(/\b[A-Z][a-z]+\b/g)?.length ?? 0;
  if (titleWords >= 4) return false;
  const digits = sentence.match(/\d/g)?.length ?? 0;
  if (digits / sentence.length > 0.12) return false;
  return VERB.test(sentence);
}
