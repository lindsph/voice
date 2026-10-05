export type CalibrationCard = {
  title: string;
  body: string;
};

export type CalibrationDocument = {
  quote: string;
  cards: CalibrationCard[];
};

const WHO_HEADINGS = ["## Who we sound like", "## Who this sounds like"] as const;

function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text: string): string {
  const match = text.match(/^.+?[.!?](?:\s|$)/);
  return (match?.[0] ?? text).trim();
}

function sectionAfter(doc: string, heading: string): string {
  const start = doc.indexOf(heading);
  if (start === -1) return "";
  const from = start + heading.length;
  const next = doc.slice(from).search(/\n## /);
  return next === -1 ? doc.slice(from) : doc.slice(from, from + next);
}

function prose(block: string): string {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("|") && !/^[-|:\s]+$/.test(line) && !line.startsWith("#"));
  if (lines.length === 0) return "";
  return plain(lines.map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "")).join(" "));
}

function firstParagraph(block: string): string {
  for (const part of block.split(/\n\s*\n/)) {
    const text = prose(part);
    if (text) return text;
  }
  return "";
}

function signalCards(who: string): CalibrationCard[] {
  return who
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => plain(line.replace(/^[-*]\s+/, "")))
    .filter(Boolean)
    .map((text) => {
      const colon = text.indexOf(":");
      if (colon > 0 && colon < 42) {
        return { title: text.slice(0, colon).trim(), body: firstSentence(text.slice(colon + 1).trim()) };
      }
      return { title: firstSentence(text), body: "" };
    });
}

function ruleCards(voice: string): CalibrationCard[] {
  const cards: CalibrationCard[] = [];
  for (const chunk of voice.split(/\n### /).slice(1)) {
    const [titleLine, ...rest] = chunk.split("\n");
    const title = plain(titleLine ?? "");
    const body = firstSentence(firstParagraph(rest.join("\n")));
    if (!title || !body) continue;
    cards.push({ title, body });
    if (cards.length === 3) break;
  }
  return cards;
}

export function calibrationDocument(guide: string): CalibrationDocument {
  const who = WHO_HEADINGS.map((heading) => sectionAfter(guide, heading)).find(Boolean) ?? "";
  const quote = firstSentence(firstParagraph(who) || firstParagraph(guide));
  const signals = signalCards(who);
  return {
    quote,
    cards: signals.length > 0 ? signals : ruleCards(sectionAfter(guide, "## Voice rules")),
  };
}
