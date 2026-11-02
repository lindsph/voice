import { describe, expect, it, vi } from "vitest";

import { cleanupDraft, cleanupSystem, countedTells, mergeBlogEdit } from "./cleanup";

const post = {
  title: "At the CNE",
  slug: "at-the-cne",
  lead: "We're at the CNE farm this week — come say hi, it's not a sales pitch, it's a chat about wool in soil.",
  sections: [
    { heading: "Timeline / results", body: "Pellets went out — fast — to growers, gardeners, and neighbours." },
    { heading: "How to replicate", body: "Ask a local guild about raw fleece." },
  ],
  faq: [
    { question: "Where?", answer: "The farm building — near the barn." },
    { question: "When?", answer: "All week." },
    { question: "Cost?", answer: "Free with entry." },
  ],
  cta: "Come find us at the booth and bring your soil questions.",
  citations: ["src-1"],
  internalLinks: ["https://shopwoolgrown.com/pages/usage-guide"],
};
const body = JSON.stringify(post);

describe("cleanup pass", () => {
  it("names the judge's tells and keeps facts", () => {
    const system = cleanupSystem("WoolGrown");
    expect(system).toContain("Keep every fact");
    expect(system).toContain("Timeline / results");
    expect(system).toContain("Do not polish");
  });

  it("keeps a cleaned blog post with fewer tells, and the original ids and links", async () => {
    const edited = {
      ...post,
      lead: "We're at the CNE farm this week. Come say hi and talk about wool in soil.",
      sections: [
        { heading: "What happened", body: "Pellets went out fast to growers and neighbours." },
        { heading: "Doing it near you", body: "Ask a local guild about raw fleece." },
      ],
      faq: post.faq.map((f) => ({ ...f, answer: f.answer.replace(" — ", ", ") })),
      citations: ["invented"],
      internalLinks: [],
    };
    const complete = vi.fn(async () => "```json\n" + JSON.stringify(edited) + "\n```");
    const out = JSON.parse(await cleanupDraft({ name: "WoolGrown", body, blog: true }, complete));
    expect(out.lead).toBe(edited.lead);
    expect(out.sections[0].heading).toBe("What happened");
    expect(out.faq[0]).toEqual({ question: "Where?", answer: "The farm building, near the barn." });
    expect(out.citations).toEqual(["src-1"]);
    expect(out.internalLinks).toEqual(post.internalLinks);
  });

  it("keeps the draft when the edit adds tells, breaks the shape, or fails", async () => {
    const worse = { ...post, cta: "Come — find us — at the booth — with questions, soil, and seeds." };
    expect(await cleanupDraft({ name: "W", body, blog: true }, async () => JSON.stringify(worse))).toBe(body);
    expect(await cleanupDraft({ name: "W", body, blog: true }, async () => "Sorry, I can't.")).toBe(body);
    const broken = { ...post, sections: [post.sections[0]] };
    expect(await cleanupDraft({ name: "W", body, blog: true }, async () => JSON.stringify(broken))).toBe(body);
    expect(
      await cleanupDraft({ name: "W", body, blog: true }, async () => {
        throw new Error("timeout");
      }),
    ).toBe(body);
  });

  it("edits plain pieces as text", async () => {
    const out = await cleanupDraft(
      { name: "W", body: "Wool — it's not hype, it's soil.", blog: false },
      async () => "Wool feeds soil.",
    );
    expect(out).toBe("Wool feeds soil.");
  });

  it("drops a faq edit that changes how many questions there are", () => {
    const merged = JSON.parse(mergeBlogEdit(body, JSON.stringify({ ...post, faq: [] }))!);
    expect(merged.faq).toEqual(post.faq);
  });

  it("counts em-dashes, contrasts and lists of three", () => {
    expect(countedTells("Wool — slow. It's not hype, it's soil.")).toBe(2);
  });
});
