import { BLOG_SHAPE_INSTRUCTION, blogDraftIssues, blogProse } from "./blog-shape";
import { collectToneSelection, formatToneBundle, type ToneBundleInput } from "./bundle";
import { lintDraft } from "./slop";
import type { DraftTrace, Profile } from "./types";

export { bannedHits } from "./slop";

export const DRAFT_MODEL = process.env.OPENAI_DRAFT_MODEL?.trim() || "gpt-4o";
export const DRAFT_TEMPERATURE = 0.45;
export const DRAFT_TIMEOUT_MS = 45_000;

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

export function buildUserPrompt(input: {
  profile: Profile;
  surfaceId: string;
  facts: string;
  seed: string;
  golds: ToneBundleInput["golds"];
  learnings: ToneBundleInput["learnings"];
  architecture?: string;
  format?: "blog" | "plain";
  retryContext?: string;
}): string {
  const surface = input.profile.surfaces.find((item) => item.id === input.surfaceId);
  const blogShape = input.format === "blog" || input.surfaceId === "blog";
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
    input.surfaceId === "blog" || blogShape
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
  },
): string[] {
  const surface = input.profile.surfaces.find((item) => item.id === input.surfaceId);
  const blogShape = input.format === "blog" || input.surfaceId === "blog";
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
    model?: string;
  },
  complete: ChatComplete,
): Promise<{ body: string; bundle: string; retried: boolean; warnings: string[]; trace: DraftTrace }> {
  const user = buildUserPrompt(input);
  const first = unwrapDraft(await complete({ system: input.profile.systemPrompt, user }));
  const hits = draftHits(first, input);
  if (hits.length === 0) {
    return { body: first, bundle: user, retried: false, warnings: [], trace: draftTrace(input, null) };
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
    body,
    bundle: user,
    retried: true,
    warnings: draftHits(body, input),
    trace: draftTrace(input, hits),
  };
}

export function isClaudeModel(model: string | undefined): boolean {
  return (model ?? "").trim().toLowerCase().startsWith("claude-");
}

/** Opus 5.5 rejects any temperature other than the default. Thinking stays on. */
export function claudeOmitsSampling(model: string): boolean {
  return model.trim().toLowerCase() === "claude-opus-5-5";
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
  const response = await (input.fetchImpl ?? fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(anthropicDraftBody(input)),
    signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(`Claude draft failed (${response.status}): ${detail}`);
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
  const completion = await client.chat.completions.create(
    {
      model: input.model?.trim() || DRAFT_MODEL,
      temperature: input.temperature ?? DRAFT_TEMPERATURE,
      store: false,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    },
    { timeout: DRAFT_TIMEOUT_MS },
  );
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("The model returned an empty draft.");
  return text;
}
