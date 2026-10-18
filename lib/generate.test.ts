import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildUserPrompt,
  completeDraft,
  completeWithAnthropic,
  CLAUDE_DRAFT_TIMEOUT_MS,
  DRAFT_MODEL,
  OPENAI_FALLBACK_MODEL,
  openAiRejectsTemperature,
  DRAFT_TIMEOUT_MS,
  formatRetryReason,
  generateDraft,
  anthropicDraftBody,
  claudeOmitsSampling,
  isClaudeModel,
  unwrapDraft,
} from "./generate";
import type { Profile } from "./types";

const lindsay: Profile = {
  id: "lindsay",
  name: "Lindsay",
  description: "Side work",
  guide: "Warm and direct.",
  systemPrompt: "Write like Lindsay.",
  bannedForPrompt: ["virtual assistant / VA as the identity"],
  surfaces: [
    {
      id: "first_note",
      label: "First note",
      maxWords: 120,
      hint: "One observation, then the offer.",
    },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const woolgrown: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Maker",
  guide: "Practical Ontario maker.",
  systemPrompt: "Write like WoolGrown.",
  bannedForPrompt: ["guaranteed / guarantee", "delve"],
  surfaces: [
    {
      id: "social",
      label: "Social",
      maxWords: 80,
      hint: "A caption.",
    },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function draftInput(profile: Profile, surfaceId: string) {
  return {
    profile,
    surfaceId,
    facts: "CNE this week.",
    seed: surfaceId,
    golds: [] as [],
    learnings: [] as [],
  };
}

describe("generateDraft slop retry", () => {
  it("does not retry a clean draft", async () => {
    const result = await generateDraft(draftInput(lindsay, "first_note"), async () => {
      return "Hey — noticed the King Street listing. Happy to look if useful.";
    });
    expect(result.retried).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.trace.retryReason).toBeUndefined();
    expect(result.trace.profileId).toBe("lindsay");
    expect(result.trace.surfaceId).toBe("first_note");
  });

  it("retries once when the first draft uses stock slop", async () => {
    let calls = 0;
    const result = await generateDraft(draftInput(lindsay, "first_note"), async () => {
      calls += 1;
      return calls === 1
        ? "Let’s delve into the messy admin."
        : "Noticed the King Street listing. Happy to look if useful.";
    });
    expect(calls).toBe(2);
    expect(result.retried).toBe(true);
    expect(result.body).toMatch(/King Street/);
    expect(result.warnings).toEqual([]);
  });

  it("returns the retry plus warnings if it is still sloppy", async () => {
    const result = await generateDraft(draftInput(lindsay, "first_note"), async () => {
      return "Let’s delve into the messy admin.";
    });
    expect(result.retried).toBe(true);
    expect(result.warnings).toContain("delve");
    expect(result.body).toMatch(/delve/);
    expect(result.trace.retryReason).toBe("banned_phrase:delve");
  });

  it("retries woolgrown mouth bans without using lindsay identity bans", async () => {
    let retryContext = "";
    const result = await generateDraft(draftInput(woolgrown, "social"), async ({ user }) => {
      if (user.includes("Previous draft failed")) {
        retryContext = user;
        return "Wool in the booth at the CNE this week.";
      }
      return "This guaranteed mulch will transform your beds.";
    });
    expect(result.retried).toBe(true);
    expect(retryContext).toMatch(/guaranteed/i);
    expect(retryContext).not.toMatch(/virtual assistant/i);
    expect(result.warnings).toEqual([]);
  });

  it("keeps untyped canonical golds and drops a different architecture", async () => {
    let user = "";
    await generateDraft(
      {
        ...draftInput(
          {
            ...woolgrown,
            surfaces: [
              ...woolgrown.surfaces,
              {
                id: "blog",
                label: "Blog",
                maxWords: null,
                hint: "Shop blog.",
              },
            ],
          },
          "blog",
        ),
        architecture: "how-to-steps",
        golds: [
          {
            id: "old",
            profileId: "woolgrown",
            title: "Founder",
            body: "Canadian sheep wool, made for gardens.",
            surface: "blog",
            architecture: "",
            canonical: true,
            status: "active",
          },
          {
            id: "ex",
            profileId: "woolgrown",
            title: "Event",
            body: "See you at the booth this weekend.",
            surface: "blog",
            architecture: "proof-story",
            canonical: false,
            status: "active",
          },
        ],
      },
      async ({ user: prompt }) => {
        user = prompt;
        return "Mix the pellets into the bed and water them in.";
      },
    );
    expect(user).toContain("Canadian sheep wool, made for gardens.");
    expect(user).not.toContain("booth this weekend");
  });

  it("asks a blog for lead, sections, faq, and one cta as JSON", async () => {
    let user = "";
    await generateDraft(
      {
        ...draftInput(
          {
            ...woolgrown,
            surfaces: [
              ...woolgrown.surfaces,
              {
                id: "blog",
                label: "Blog",
                maxWords: null,
                hint: "Shop blog.",
              },
            ],
          },
          "blog",
        ),
        facts: "Allowed citation ids: woolgrown-founder-brief.",
      },
      async ({ user: prompt }) => {
        user = prompt;
        return JSON.stringify({
          lead: "Wool pellets hold moisture in the pot. Water them in and let them work through the season.",
          sections: [
            { heading: "Mix", body: "Mix the pellets into the top of the bed, then water." },
            { heading: "Wait", body: "Let the wool work through the season without extra feed." },
          ],
          faq: [
            { question: "How much?", answer: "About half a cup in a small pot." },
            { question: "How often?", answer: "Once at planting is enough for the season." },
            { question: "Safe?", answer: "They are a garden input, not a snack." },
          ],
          cta: "WoolGrown pellets are on the shop when you are ready to try a bed.",
        });
      },
    );
    expect(user).toContain("lead");
    expect(user).toContain("sections");
    expect(user).toContain("one soft close");
    expect(user).toContain("metaDescription, excerpt,");
    expect(user).not.toContain("Write the draft only");
  });

  it("records the context that influenced the draft", async () => {
    let calls = 0;
    const facts = "Raised beds at the booth.";
    const result = await generateDraft(
      {
        ...draftInput(woolgrown, "social"),
        facts,
        seed: "raised-beds",
        architecture: "how-to-steps",
        model: "claude-opus-4-6",
        golds: [
          {
            id: "woolgrown-howto",
            profileId: "woolgrown",
            title: "How to",
            body: "Mix the pellets into the raised bed, then water.",
            surface: "social",
            architecture: "how-to-steps",
            canonical: true,
            status: "active",
          },
          {
            id: "woolgrown-uncertainty",
            profileId: "woolgrown",
            title: "Uncertainty",
            body: "Gardeners often report fewer slug visits. Studies are still thin.",
            surface: "social",
            architecture: "",
            canonical: true,
            status: "active",
          },
          {
            id: "other-arch",
            profileId: "woolgrown",
            title: "Proof",
            body: "See you at the booth this weekend.",
            surface: "social",
            architecture: "proof-story",
            canonical: false,
            status: "active",
          },
        ],
        learnings: [
          {
            id: "tl-123",
            profileId: "woolgrown",
            rule: "Name the fair and the place.",
            status: "active",
            surface: "social",
          },
          {
            id: "tl-other",
            profileId: "woolgrown",
            rule: "Do not use this on a note.",
            status: "active",
            surface: "first_note",
          },
        ],
      },
      async () => {
        calls += 1;
        return calls === 1
          ? "This guaranteed mulch will transform your beds."
          : "Wool in the booth at the CNE this week.";
      },
    );
    expect(result.retried).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.trace).toMatchObject({
      profileId: "woolgrown",
      surfaceId: "social",
      model: "claude-opus-4-6",
      factsCharacterCount: facts.length,
      seed: "raised-beds",
      architecture: "how-to-steps",
      retryReason: "banned_phrase:guaranteed",
      selectedLearningIds: ["tl-123"],
    });
    expect(result.trace.selectedGoldIds).toEqual(
      expect.arrayContaining(["woolgrown-howto", "woolgrown-uncertainty"]),
    );
    expect(result.trace.selectedGoldIds).not.toContain("other-arch");
    expect(result.trace.bannedPhrasesChecked).toEqual(
      expect.arrayContaining(["guaranteed", "delve"]),
    );
    expect(result.trace.selectedGolds.find((gold) => gold.id === "woolgrown-howto")?.reason).toMatch(
      /Gold example/,
    );
    expect(result.trace.selectedLearnings[0]?.reason).toMatch(/Same surface/);
    expect(result.bundle).toContain("How to");
    expect(result.bundle).not.toContain("booth this weekend");
  });

  it("carries learning kind on the trace and leaves the draft prompt alone", async () => {
    const input = {
      ...draftInput(woolgrown, "social"),
      facts: "CNE this week.",
      learnings: [
        {
          id: "voice",
          profileId: "woolgrown",
          rule: "Use contractions.",
          status: "active" as const,
          surface: "social",
          kind: "voice" as const,
          classificationSource: "heuristic" as const,
          classificationMismatch: false,
        },
        {
          id: "fact",
          profileId: "woolgrown",
          rule: "Do not invent studies.",
          status: "active" as const,
          surface: "social",
          kind: "fact" as const,
          classificationSource: "separate_call" as const,
          classificationMismatch: false,
        },
        {
          id: "unknown",
          profileId: "woolgrown",
          rule: "Keep it practical.",
          status: "active" as const,
          surface: "social",
          kind: "unknown" as const,
          classificationSource: "fallback" as const,
          classificationMismatch: true,
        },
      ],
    };
    const before = buildUserPrompt(input);
    const after = buildUserPrompt(input);
    expect(after).toBe(before);
    expect(after).toContain("Use contractions.");
    expect(after).toContain("Do not invent studies.");
    expect(after).toContain("Keep it practical.");
    expect(after).not.toContain("Classify this learning rule");
    expect(after).not.toContain("classificationMismatch");
    const result = await generateDraft(input, async () => "Wool in the booth at the CNE this week.");
    expect(result.bundle).toBe(before);
    expect(result.trace.selectedLearnings).toEqual([
      expect.objectContaining({
        id: "voice",
        rule: "Use contractions.",
        kind: "voice",
        classificationSource: "heuristic",
        classificationMismatch: false,
      }),
      expect.objectContaining({
        id: "fact",
        kind: "fact",
        classificationSource: "separate_call",
      }),
      expect.objectContaining({
        id: "unknown",
        kind: "unknown",
        classificationMismatch: true,
      }),
    ]);
  });

  it("counts trimmed facts and leaves architecture off when it was not asked", async () => {
    const result = await generateDraft(
      {
        ...draftInput(lindsay, "first_note"),
        facts: "  CNE.  ",
        model: "  gpt-4o  ",
      },
      async () => "Hey — noticed the listing. Happy to look if useful.",
    );
    expect(result.trace.factsCharacterCount).toBe(4);
    expect(result.trace.model).toBe("gpt-4o");
    expect(result.trace.architecture).toBeUndefined();
    expect(result.trace.seed).toBe("first_note");
    expect(result.trace.selectedGoldIds).toEqual([]);
    expect(result.trace.selectedLearningIds).toEqual([]);
  });

  it("uses the default draft model when none is passed", async () => {
    const result = await generateDraft(draftInput(lindsay, "first_note"), async () => {
      return "Hey — noticed the listing. Happy to look if useful.";
    });
    expect(result.trace.model).toBe(DRAFT_MODEL);
  });

  it("keeps a blog shape miss as the retry reason", async () => {
    let calls = 0;
    const result = await generateDraft(
      { ...draftInput(woolgrown, "blog"), format: "blog" },
      async () => {
        calls += 1;
        if (calls === 1) return "not json";
        return JSON.stringify({
          lead: "Wool pellets hold moisture in the pot. Water them in and let them work through the season.",
          sections: [
            { heading: "Mix", body: "Mix the pellets into the top of the bed, then water." },
            { heading: "Wait", body: "Let the wool work through the season without extra feed." },
          ],
          faq: [
            { question: "How much?", answer: "About half a cup in a small pot." },
            { question: "How often?", answer: "Once at planting is enough for the season." },
            { question: "Safe?", answer: "They are a garden input, not a snack." },
          ],
          cta: "WoolGrown pellets are on the shop when you are ready to try a bed.",
        });
      },
    );
    expect(result.retried).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.trace.retryReason).toMatch(/Blog draft must be one JSON object/);
    expect(result.trace.retryReason).not.toMatch(/banned_phrase/);
  });

  it("names each first-pass ban when the retry is still sloppy", async () => {
    const result = await generateDraft(draftInput(woolgrown, "social"), async () => {
      return "This guaranteed mulch will delve into your beds.";
    });
    expect(result.retried).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.trace.retryReason).toContain("banned_phrase:guaranteed");
    expect(result.trace.retryReason).toContain("banned_phrase:delve");
  });
});

describe("formatRetryReason", () => {
  it("labels a short ban and leaves shape failures as written", () => {
    expect(
      formatRetryReason([
        "guaranteed / guarantee",
        "it's not X, it's Y (2 times)",
        "lead must be an answer-first paragraph",
      ]),
    ).toBe(
      "banned_phrase:guaranteed; it's not X, it's Y (2 times); lead must be an answer-first paragraph",
    );
  });
});

describe("unwrapDraft", () => {
  it("strips a json fence and a bare json label before the object", () => {
    expect(unwrapDraft('```json { "a": 1 }\n```')).toBe('{ "a": 1 }');
    expect(unwrapDraft('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(unwrapDraft('json {"a":1}')).toBe('{"a":1}');
    expect(unwrapDraft("```markdown\nhello\n```")).toBe("hello");
  });
});

describe("model routing", () => {
  it("gives Claude blog drafts 4 minutes and leaves short notes at 45 seconds", () => {
    expect(CLAUDE_DRAFT_TIMEOUT_MS).toBe(4 * 60 * 1000);
    expect(DRAFT_TIMEOUT_MS).toBe(45_000);
    const toml = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../fly.toml"),
      "utf8",
    );
    expect(toml).toMatch(/\[http_service\.http_options\][\s\S]*idle_timeout\s*=\s*600/);
  });

  it("treats claude model ids as Claude and everything else as OpenAI", () => {
    expect(isClaudeModel("claude-opus-4-6")).toBe(true);
    expect(isClaudeModel(" Claude-Sonnet-4-6 ")).toBe(true);
    expect(isClaudeModel("gpt-4o")).toBe(false);
    expect(isClaudeModel(undefined)).toBe(false);
    expect(claudeOmitsSampling("claude-opus-5-5")).toBe(true);
    expect(claudeOmitsSampling("claude-opus-4-6")).toBe(false);
  });

  it("defaults to Opus 5.5 for writing and learning, with an OpenAI fallback that is not Claude", () => {
    expect(process.env.VOICE_DRAFT_MODEL).toBeUndefined();
    expect(DRAFT_MODEL).toBe("claude-opus-5-5");
    expect(isClaudeModel(OPENAI_FALLBACK_MODEL)).toBe(false);
  });

  it("omits temperature on Sonnet 5.5 and on a model Voice has never seen", () => {
    for (const model of ["claude-sonnet-5-5", " Claude-Haiku-5-5 ", "claude-opus-6"]) {
      const body = anthropicDraftBody({ system: "s", user: "u", model, temperature: 0.45 });
      expect(body.temperature, model).toBeUndefined();
      expect(body.output_config, model).toEqual({ effort: "medium" });
    }
    for (const model of ["claude-sonnet-4-6", "claude-haiku-4-5"]) {
      expect(anthropicDraftBody({ system: "s", user: "u", model }).temperature, model).toBe(0.45);
    }
  });

  it("omits temperature on Opus 5.5 and keeps it on Opus 4.6", () => {
    const newer = anthropicDraftBody({
      system: "Write like WoolGrown.",
      user: "Facts.",
      model: "claude-opus-5-5",
      temperature: 0.45,
    });
    expect(newer.temperature).toBeUndefined();
    expect(newer.max_tokens).toBe(16000);
    expect(newer.output_config).toEqual({ effort: "medium" });

    const current = anthropicDraftBody({
      system: "Write like WoolGrown.",
      user: "Facts.",
      model: "claude-opus-4-6",
    });
    expect(current.temperature).toBe(0.45);
    expect(current.max_tokens).toBe(8192);
    expect(current.output_config).toBeUndefined();
  });

  it("sends a Claude model to Anthropic with the Voice system and user text", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => new AbortController().signal);
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        system: string;
        messages: Array<{ content: string }>;
      };
      expect(body.model).toBe("claude-opus-4-6");
      expect(body.system).toBe("Write like WoolGrown.");
      expect(body.messages[0]?.content).toContain("wool pellets");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Mix the pellets into the bed and water them in." }],
        }),
        { status: 200 },
      );
    };
    try {
      const text = await completeDraft({
        system: "Write like WoolGrown.",
        user: "Facts: wool pellets.",
        model: "claude-opus-4-6",
        fetchImpl: fetchImpl as typeof fetch,
      });
      expect(text).toMatch(/Mix the pellets/);
      expect(timeout).toHaveBeenCalledWith(CLAUDE_DRAFT_TIMEOUT_MS);
    } finally {
      timeout.mockRestore();
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("names the model when Claude runs past 4 minutes", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
    try {
      for (const name of ["TimeoutError", "AbortError"]) {
        await expect(
          completeWithAnthropic({
            system: "Write like WoolGrown.",
            user: "Facts.",
            model: "claude-opus-4-6",
            fetchImpl: (async () => {
              throw Object.assign(new Error("The operation was aborted due to timeout"), {
                name,
              });
            }) as typeof fetch,
          }),
        ).rejects.toMatchObject({
          message: "Claude draft timed out after 4 minutes (claude-opus-4-6).",
          status: 504,
        });
      }
    } finally {
      vi.restoreAllMocks();
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("keeps Claude’s status and response on a failed draft", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
    try {
      await expect(
        completeWithAnthropic({
          system: "Write like WoolGrown.",
          user: "Facts.",
          model: "claude-opus-4-6",
          fetchImpl: (async () =>
            new Response('{"type":"error","error":{"message":"model not found"}}', {
              status: 404,
            })) as typeof fetch,
        }),
      ).rejects.toMatchObject({
        message:
          'Claude draft failed (404): {"type":"error","error":{"message":"model not found"}}',
        status: 404,
      });
    } finally {
      vi.restoreAllMocks();
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("refuses a Claude draft when Voice has no Anthropic key", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        completeWithAnthropic({
          system: "Write like WoolGrown.",
          user: "Facts.",
          model: "claude-opus-4-6",
          fetchImpl: (async () => {
            throw new Error("should not fetch");
          }) as typeof fetch,
        }),
      ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});

const blogProfile: Profile = {
  ...woolgrown,
  surfaces: [
    {
      id: "blog",
      label: "Blog",
      maxWords: null,
      hint: "Shop blog draft. Lead, then sections, then a short FAQ, then one soft CTA.",
    },
  ],
};

const validBlog = JSON.stringify({
  title: "Leftover Wool Has a Job",
  lead: "Wool pellets hold moisture in the pot. Water them in and let them work through the season.",
  sections: [
    { heading: "Mix", body: "Mix the pellets into the top of the bed, then water." },
    { heading: "Wait", body: "Let the wool work through the season without extra feed." },
  ],
  faq: [
    { question: "How much?", answer: "About half a cup in a small pot." },
    { question: "How often?", answer: "Once at planting is enough for the season." },
    { question: "Safe?", answer: "They are a garden input, not a snack." },
  ],
  cta: "WoolGrown pellets are on the shop when you are ready to try a bed.",
});

describe("shopify headline task", () => {
  it("asks for one headline and skips the blog shape and the no-title line", async () => {
    let user = "";
    const result = await generateDraft(
      {
        ...draftInput(blogProfile, "blog"),
        task: "shopify_headline",
        architecture: "how-to-steps",
        facts: "The scraps became sauna hats and garden beds.",
        golds: [
          {
            id: "howto",
            title: "How to",
            body: "Mix the pellets in, then water.",
            surface: "blog",
            canonical: true,
            profileId: "woolgrown",
            architecture: "how-to-steps",
          },
          {
            id: "other-arch",
            title: "Proof",
            body: "This proof story should stay out.",
            surface: "blog",
            canonical: false,
            profileId: "woolgrown",
            architecture: "proof-story",
          },
          {
            id: "social-gold",
            title: "Caption",
            body: "This caption should stay out.",
            surface: "social",
            canonical: true,
            profileId: "woolgrown",
          },
        ],
      },
      async ({ user: prompt }) => {
        user = prompt;
        return JSON.stringify({ headline: "  Leftover wool has a job  " });
      },
    );
    expect(user).toContain('{"headline":"one reader-facing Shopify headline"}');
    expect(user).toContain("The scraps became sauna hats and garden beds.");
    expect(user).toContain("Mix the pellets in, then water.");
    expect(user).not.toContain("This proof story should stay out.");
    expect(user).not.toContain("This caption should stay out.");
    expect(user).not.toContain("Shape of the post");
    expect(user).not.toContain("Lead, then sections");
    expect(user).not.toContain("no title");
    expect(result.body).toBe(JSON.stringify({ headline: "Leftover wool has a job" }));
    expect(result.retried).toBe(false);
  });

  it("rejects a full article instead of reading its title", async () => {
    await expect(
      generateDraft(
        { ...draftInput(blogProfile, "blog"), task: "shopify_headline" },
        async () => validBlog,
      ),
    ).rejects.toThrow(/non-empty headline/);
  });

  it("asks for one excerpt with the excerpt task and returns it as JSON", async () => {
    let user = "";
    const result = await generateDraft(
      {
        ...draftInput(blogProfile, "blog"),
        task: "shopify_excerpt",
        facts: "Mix half a cup of pellets into four cups of potting mix.",
      },
      async ({ user: prompt }) => {
        user = prompt;
        return JSON.stringify({ excerpt: "  Mix half a cup into\n four cups of mix.  " });
      },
    );
    expect(user).toContain('{"excerpt":"one or two sentences for the blog page preview"}');
    expect(user).toContain("Mix half a cup of pellets into four cups of potting mix.");
    expect(user).not.toContain('{"headline"');
    expect(user).not.toContain("Shape of the post");
    expect(result.body).toBe(JSON.stringify({ excerpt: "Mix half a cup into four cups of mix." }));
    expect(result.retried).toBe(false);
  });

  it("rejects a full article for the excerpt task", async () => {
    await expect(
      generateDraft(
        { ...draftInput(blogProfile, "blog"), task: "shopify_excerpt" },
        async () => validBlog,
      ),
    ).rejects.toThrow(/non-empty excerpt/);
  });

  it("keeps the full blog instruction on the blog surface when no format is sent", async () => {
    let user = "";
    await generateDraft(draftInput(blogProfile, "blog"), async ({ user: prompt }) => {
      user = prompt;
      return validBlog;
    });
    expect(user).toContain("Shape of the post");
    expect(user).toContain("Lead, then sections");
    expect(user).not.toContain("no title");
  });

  it("swaps the caption note and word cap for the passage note when format is plain", async () => {
    let user = "";
    await generateDraft(
      { ...draftInput(woolgrown, "social"), format: "plain" },
      async ({ user: prompt }) => {
        user = prompt;
        return "Mix half a cup into four cups.";
      },
    );
    expect(user).toContain("Edit one passage. Return only the replacement for it");
    expect(user).not.toContain("A caption.");
    expect(user).not.toContain("Stay under 80 words");
  });

  it("keeps the caption note when no format is sent", async () => {
    let user = "";
    await generateDraft(draftInput(woolgrown, "social"), async ({ user: prompt }) => {
      user = prompt;
      return "Mix half a cup into four cups.";
    });
    expect(user).toContain("A caption.");
    expect(user).toContain("Stay under 80 words");
    expect(user).not.toContain("Edit one passage");
  });

  it("asks for one plain passage when format is plain on the blog surface", async () => {
    const prompts: string[] = [];
    const result = await generateDraft(
      {
        ...draftInput(blogProfile, "blog"),
        format: "plain",
        facts: "Rewrite the bracketed selection. Mix half a cup of pellets into four cups of potting mix.",
      },
      async ({ user: prompt }) => {
        prompts.push(prompt);
        return "Mix half a cup of pellets into every four cups of potting mix.";
      },
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Edit one passage. Return only the replacement for it");
    expect(prompts[0]).toContain("no title");
    expect(prompts[0]).not.toContain("Shape of the post");
    expect(prompts[0]).not.toContain("Lead, then sections");
    expect(result.body).toBe("Mix half a cup of pellets into every four cups of potting mix.");
    expect(result.retried).toBe(false);
    expect(result.warnings).toEqual([]);
  });
});

describe("OpenAI temperature", () => {
  const create = vi.fn();
  beforeEach(() => {
    create.mockReset();
    vi.doMock("openai", () => ({
      default: class {
        chat = { completions: { create } };
      },
    }));
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
  });

  it("recognises OpenAI's refusal of a non-default temperature, and nothing else", () => {
    expect(
      openAiRejectsTemperature({
        status: 400,
        message: "400 Unsupported value: 'temperature' does not support 0.45 with this model.",
      }),
    ).toBe(true);
    expect(openAiRejectsTemperature({ status: 400, message: "Invalid model" })).toBe(false);
    expect(openAiRejectsTemperature({ status: 429, message: "temperature" })).toBe(false);
    expect(openAiRejectsTemperature(null)).toBe(false);
  });

  it("retries without temperature when a newer model refuses it", async () => {
    const { completeWithOpenAi: complete } = await import("./generate");
    create
      .mockRejectedValueOnce(Object.assign(new Error("400 Unsupported value: 'temperature'"), { status: 400 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: "Mix it in." } }] });
    await expect(complete({ system: "s", user: "u", model: "gpt-5.6-luna" })).resolves.toBe("Mix it in.");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ model: "gpt-5.6-luna", temperature: 0.45 });
    expect(create.mock.calls[1]?.[0]).not.toHaveProperty("temperature");
  });

  it("does not retry other errors", async () => {
    const { completeWithOpenAi: complete } = await import("./generate");
    create.mockRejectedValueOnce(Object.assign(new Error("429 rate limited"), { status: 429 }));
    await expect(complete({ system: "s", user: "u", model: "gpt-4o" })).rejects.toThrow("429");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
