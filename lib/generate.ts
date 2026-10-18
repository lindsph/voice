import { BLOG_SHAPE_INSTRUCTION, blogDraftIssues, blogProse } from "./blog-shape";
import { collectToneSelection, formatToneBundle, type ToneBundleInput } from "./bundle";
import {
  parseShopifyHeadline,
  SHOPIFY_HEADLINE_INSTRUCTION,
  SHOPIFY_HEADLINE_TASK,
  ShopifyHeadlineRejected,
  shopifyHeadlineBody,
  type ShopifyHeadlineTask,
} from "./shopify-headline";
import {
  parseShopifyExcerpt,
  SHOPIFY_EXCERPT_INSTRUCTION,
  SHOPIFY_EXCERPT_TASK,
  ShopifyExcerptRejected,
  shopifyExcerptBody,
  type ShopifyExcerptTask,
} from "./shopify-excerpt";
import { lintDraft } from "./slop";
import type { DraftTrace, Profile } from "./types";

export { ShopifyExcerptRejected, ShopifyHeadlineRejected };

/** One-line Shopify fields. Not blog drafts, and not format "plain". */
export type ShopifyTask = ShopifyHeadlineTask | ShopifyExcerptTask;

export { bannedHits } from "./slop";

/**
 * Default for any request that names no model (excerpts, headlines, captions)
 * and for learning from her edits. Voice audit 17–18 Oct 2026, 10 models on the
 * six hardest requests: only Opus 5.5 passed all 18 (lengths, links, claims,
 * no added facts) while still sounding like her; gpt-4o wrote hype in about
 * half, and its learned rules taught the hype back. Roll back without a code
 * change: `flyctl secrets set VOICE_DRAFT_MODEL=gpt-4o -a lindsay-voice`.
 * OPENAI_DRAFT_MODEL is the old name, still read.
 */
export const DRAFT_MODEL =
  process.env.VOICE_DRAFT_MODEL?.trim() ||
  process.env.OPENAI_DRAFT_MODEL?.trim() ||
  "claude-opus-5-5";
/** OpenAI model when a caller reaches completeWithOpenAi without naming one. */
export const OPENAI_FALLBACK_MODEL = "gpt-4o";
export const DRAFT_TEMPERATURE = 0.45;
/** Short OpenAI notes. Claude blog drafts use CLAUDE_DRAFT_TIMEOUT_MS. */
export const DRAFT_TIMEOUT_MS = 45_000;
/**
 * Anthropic’s non-streaming estimate for this draft’s 8,192-token cap:
 * 1 hour × 8192 / 128000 ≈ 4 minutes.
 */
export const CLAUDE_DRAFT_TIMEOUT_MS = 4 * 60 * 1000;

export type ChatComplete = (input: { system: string; user: string }) => Promise<string>;

export function unwrapDraft(text: string): string {
  let body = text.trim();
  // Opus 5.5 often opens with ```json even when told not to fence.
  body = body.replace(/^```[a-zA-Z0-9_-]*\s*/, "").replace(/\s*```$/, "").trim();
  body = body.replace(/^json(?=\s*[{[])/i, "").trim();
  if (
    (body.startsWith('"') && body.endsWith('"')) ||
    (body.startsWith("“") && body.endsWith("”"))
  ) {
    body = body.slice(1, -1).trim();
  }
  return body;
}

/** Blog JSON unless the caller asked for plain. A plain blog request is one passage (rewrite/shorten). */
export function isBlogShape(input: { surfaceId: string; format?: "blog" | "plain" }): boolean {
  if (input.format === "plain") return false;
  return input.format === "blog" || input.surfaceId === "blog";
}

/** A plain request edits one passage (rewrite/shorten). The caller sets the length. */
export const PASSAGE_EDIT_HINT =
  "Edit one passage. Return only the replacement for it, not a whole post, FAQ answer, or caption. No title, sections, FAQ, CTA, JSON, or added sentences.";

/** Surface hints describe a whole post, answer, or caption, so a plain request swaps in the passage note. */
function promptSurface(input: {
  profile: Profile;
  surfaceId: string;
  format?: "blog" | "plain";
}): Profile["surfaces"][number] | undefined {
  const surface = input.profile.surfaces.find((item) => item.id === input.surfaceId);
  if (!surface || input.format !== "plain") return surface;
  return { ...surface, hint: PASSAGE_EDIT_HINT, maxWords: null };
}

export function buildUserPrompt(input: {
  profile: Profile;
  surfaceId: string;
  facts: string;
  seed: string;
  golds: ToneBundleInput["golds"];
  learnings: ToneBundleInput["learnings"];
  architecture?: string;
  format?: "blog" | "plain";
  task?: ShopifyTask;
  retryContext?: string;
}): string {
  if (input.task === SHOPIFY_HEADLINE_TASK || input.task === SHOPIFY_EXCERPT_TASK) {
    return [
      `Write for the “${input.profile.name}” voice.`,
      "",
      "Facts (the saved draft — do not invent beyond this):",
      input.facts.trim(),
      "",
      formatToneBundle({
        guide: input.profile.guide,
        bannedForPrompt: input.profile.bannedForPrompt,
        surface: undefined,
        surfaceId: input.surfaceId,
        seed: input.seed,
        facts: input.facts,
        profileId: input.profile.id,
        architecture: input.architecture,
        golds: input.golds,
        learnings: input.learnings,
      }),
      ...(input.retryContext
        ? ["", "Previous draft failed a standing rule. Rewrite from scratch and fix:", input.retryContext]
        : []),
      "",
      input.task === SHOPIFY_EXCERPT_TASK
        ? SHOPIFY_EXCERPT_INSTRUCTION
        : SHOPIFY_HEADLINE_INSTRUCTION,
    ].join("\n");
  }
  const blogShape = isBlogShape(input);
  const surface = promptSurface(input);
  return [
    `Write for the “${input.profile.name}” voice.`,
    surface?.hint ?? `Surface: ${input.surfaceId}`,
    surface?.maxWords ? `Stay under ${surface.maxWords} words.` : "Do not pad.",
    "",
    "Facts (do not invent beyond this):",
    input.facts.trim(),
    "",
    formatToneBundle({
      guide: input.profile.guide,
      bannedForPrompt: input.profile.bannedForPrompt,
      surface,
      surfaceId: input.surfaceId,
      seed: input.seed,
      facts: input.facts,
      profileId: input.profile.id,
      architecture: input.architecture,
      golds: input.golds,
      learnings: input.learnings,
    }),
    ...(input.retryContext
      ? ["", "Previous draft failed a standing rule. Rewrite from scratch and fix:", input.retryContext]
      : []),
    "",
    blogShape
      ? BLOG_SHAPE_INSTRUCTION
      : "Write the draft only — no title, no quotation marks around the whole thing, no preamble.",
  ].join("\n");
}

function draftHits(
  body: string,
  input: {
    profile: Profile;
    surfaceId: string;
    format?: "blog" | "plain";
    task?: ShopifyTask;
  },
): string[] {
  const surface = input.profile.surfaces.find((item) => item.id === input.surfaceId);
  if (input.task === SHOPIFY_EXCERPT_TASK) {
    const excerpt = parseShopifyExcerpt(body);
    if (!excerpt) {
      return ["Shopify excerpt must be one JSON object with a non-empty excerpt."];
    }
    return lintDraft({
      body: excerpt,
      banned: input.profile.bannedForPrompt,
      surfaceId: input.surfaceId,
      maxWords: null,
    });
  }
  if (input.task === SHOPIFY_HEADLINE_TASK) {
    const headline = parseShopifyHeadline(body);
    if (!headline) {
      return ["Shopify headline must be one JSON object with a non-empty headline."];
    }
    return lintDraft({
      body: headline,
      banned: input.profile.bannedForPrompt,
      surfaceId: input.surfaceId,
      maxWords: null,
    });
  }
  const blogShape = isBlogShape(input);
  const prose = blogShape ? blogProse(body) : body;
  return [
    ...(blogShape ? blogDraftIssues(body) : []),
    ...lintDraft({
      body: prose,
      banned: input.profile.bannedForPrompt,
      surfaceId: input.surfaceId,
      maxWords: surface?.maxWords,
    }),
  ];
}

export function formatRetryReason(hits: string[]): string {
  return hits
    .map((hit) => {
      const token = (hit.split("/")[0] ?? hit).trim();
      if (token.length > 0 && token.length < 48 && !token.includes("(") && !/\bmust\b/i.test(token)) {
        return `banned_phrase:${token.toLowerCase()}`;
      }
      return hit;
    })
    .join("; ");
}

function draftTrace(
  input: {
    profile: Profile;
    surfaceId: string;
    facts: string;
    seed: string;
    golds: ToneBundleInput["golds"];
    learnings: ToneBundleInput["learnings"];
    architecture?: string;
    model?: string;
  },
  retryHits: string[] | null,
): DraftTrace {
  const surface = input.profile.surfaces.find((item) => item.id === input.surfaceId);
  const selection = collectToneSelection({
    guide: input.profile.guide,
    bannedForPrompt: input.profile.bannedForPrompt,
    surface,
    surfaceId: input.surfaceId,
    seed: input.seed,
    facts: input.facts,
    profileId: input.profile.id,
    architecture: input.architecture,
    golds: input.golds,
    learnings: input.learnings,
  });
  const architecture = input.architecture?.trim();
  return {
    profileId: input.profile.id,
    surfaceId: input.surfaceId,
    model: input.model?.trim() || DRAFT_MODEL,
    factsCharacterCount: input.facts.trim().length,
    selectedGoldIds: selection.golds.map((item) => item.id),
    selectedLearningIds: selection.learnings.map((item) => item.id),
    bannedPhrasesChecked: selection.bannedPhrasesChecked,
    seed: input.seed,
    ...(architecture ? { architecture } : {}),
    ...(retryHits && retryHits.length > 0 ? { retryReason: formatRetryReason(retryHits) } : {}),
    selectedGolds: selection.golds.map(({ id, title, reason }) => ({ id, title, reason })),
    selectedLearnings: selection.learnings.map((item) => ({
      id: item.id,
      rule: item.rule,
      reason: item.reason,
      ...(item.kind ? { kind: item.kind } : {}),
      ...(item.classificationSource ? { classificationSource: item.classificationSource } : {}),
      ...(typeof item.classificationMismatch === "boolean"
        ? { classificationMismatch: item.classificationMismatch }
        : {}),
    })),
  };
}

export async function generateDraft(
  input: {
    profile: Profile;
    surfaceId: string;
    facts: string;
    seed: string;
    golds: ToneBundleInput["golds"];
    learnings: ToneBundleInput["learnings"];
    architecture?: string;
    format?: "blog" | "plain";
    task?: ShopifyTask;
    model?: string;
  },
  complete: ChatComplete,
): Promise<{ body: string; bundle: string; retried: boolean; warnings: string[]; trace: DraftTrace }> {
  const user = buildUserPrompt(input);
  const first = unwrapDraft(await complete({ system: input.profile.systemPrompt, user }));
  const hits = draftHits(first, input);
  if (hits.length === 0) {
    return {
      body: headlineBody(input.task, first),
      bundle: user,
      retried: false,
      warnings: [],
      trace: draftTrace(input, null),
    };
  }
  const second = unwrapDraft(
    await complete({
      system: input.profile.systemPrompt,
      user: buildUserPrompt({
        ...input,
        retryContext: hits.map((item) => `- ${item}`).join("\n"),
      }),
    }),
  );
  const body = second || first;
  return {
    body: headlineBody(input.task, body),
    bundle: user,
    retried: true,
    warnings: draftHits(body, input),
    trace: draftTrace(input, hits),
  };
}

function headlineBody(task: ShopifyTask | undefined, body: string): string {
  if (task === SHOPIFY_EXCERPT_TASK) {
    const excerpt = parseShopifyExcerpt(body);
    if (!excerpt) throw new ShopifyExcerptRejected();
    return shopifyExcerptBody(excerpt);
  }
  if (task !== SHOPIFY_HEADLINE_TASK) return body;
  const headline = parseShopifyHeadline(body);
  if (!headline) throw new ShopifyHeadlineRejected();
  return shopifyHeadlineBody(headline);
}

export function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  );
}

export function claudeDraftTimeoutError(model: string): Error {
  return Object.assign(
    new Error(`Claude draft timed out after 4 minutes (${model}).`),
    { status: 504 },
  );
}

export function isClaudeModel(model: string | undefined): boolean {
  return (model ?? "").trim().toLowerCase().startsWith("claude-");
}

/**
 * Claude models that still take a temperature. Opus 4.7 and every newer model
 * (Opus 5.5, Sonnet 5.5, Haiku 5.5…) reject it with a 400, so a model not on
 * this list gets no temperature: a new model works by default.
 */
export const CLAUDE_SAMPLING_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

/** No temperature, thinking stays on, effort medium. True for any model not known to take a temperature. */
export function claudeOmitsSampling(model: string): boolean {
  const id = model.trim().toLowerCase();
  return !(CLAUDE_SAMPLING_MODELS as readonly string[]).includes(id);
}

export async function completeWithAnthropic(input: {
  system: string;
  user: string;
  model: string;
  temperature?: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Add ANTHROPIC_API_KEY to Voice’s .env.");
  }
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicDraftBody(input)),
      signal: AbortSignal.timeout(CLAUDE_DRAFT_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) throw claudeDraftTimeoutError(input.model);
    throw err;
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw Object.assign(
      new Error(`Claude draft failed (${response.status}): ${detail}`),
      { status: response.status },
    );
  }
  const json = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (json.content ?? [])
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text!.trim())
    .join("\n")
    .trim();
  if (!text) throw new Error("The model returned an empty draft.");
  return text;
}

export function anthropicDraftBody(input: {
  system: string;
  user: string;
  model: string;
  temperature?: number;
}): Record<string, unknown> {
  const model = input.model.trim();
  const body: Record<string, unknown> = {
    model,
    max_tokens: claudeOmitsSampling(model) ? 16000 : 8192,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
  };
  if (claudeOmitsSampling(model)) {
    body.output_config = { effort: "medium" };
  } else {
    body.temperature = input.temperature ?? DRAFT_TEMPERATURE;
  }
  return body;
}

export async function completeDraft(input: {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const model = input.model?.trim() || DRAFT_MODEL;
  if (isClaudeModel(model)) {
    return completeWithAnthropic({ ...input, model });
  }
  return completeWithOpenAi({ ...input, model });
}

/** OpenAI's 400 for a model that only takes its default temperature. */
export function openAiRejectsTemperature(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  const message = String((err as { message?: unknown }).message ?? "");
  return status === 400 && /temperature/i.test(message);
}

export async function completeWithOpenAi(input: {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Add OPENAI_API_KEY to Voice’s .env.");
  }
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const request = {
    model: input.model?.trim() || OPENAI_FALLBACK_MODEL,
    store: false,
    messages: [
      { role: "system" as const, content: input.system },
      { role: "user" as const, content: input.user },
    ],
  };
  let completion;
  try {
    completion = await client.chat.completions.create(
      { ...request, temperature: input.temperature ?? DRAFT_TEMPERATURE },
      { timeout: DRAFT_TIMEOUT_MS },
    );
  } catch (err) {
    // GPT-5.6, GPT-6 and newer take only their default temperature.
    if (!openAiRejectsTemperature(err)) throw err;
    completion = await client.chat.completions.create(request, { timeout: DRAFT_TIMEOUT_MS });
  }
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("The model returned an empty draft.");
  return text;
}
