import { formatToneBundle } from "./bundle";
import { lintDraft } from "./slop";
import type { Gold, Learning, Profile } from "./types";

export { bannedHits } from "./slop";

export const DRAFT_MODEL = process.env.OPENAI_DRAFT_MODEL?.trim() || "gpt-4o";
export const DRAFT_TEMPERATURE = 0.45;
export const DRAFT_TIMEOUT_MS = 45_000;

export type ChatComplete = (input: { system: string; user: string }) => Promise<string>;

export function unwrapDraft(text: string): string {
  let body = text.trim();
  body = body.replace(/^```(?:text|markdown)?\n?/, "").replace(/\n?```$/, "").trim();
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
  golds: Pick<Gold, "id" | "title" | "body" | "surface" | "canonical">[];
  learnings: Pick<Learning, "rule" | "status">[];
  retryContext?: string;
}): string {
  const surface = input.profile.surfaces.find((item) => item.id === input.surfaceId);
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
      golds: input.golds,
      learnings: input.learnings,
    }),
    ...(input.retryContext
      ? ["", "Previous draft failed a standing rule. Rewrite from scratch and fix:", input.retryContext]
      : []),
    "",
    "Write the draft only — no title, no quotation marks around the whole thing, no preamble.",
  ].join("\n");
}

function draftHits(
  body: string,
  input: {
    profile: Profile;
    surfaceId: string;
  },
): string[] {
  const surface = input.profile.surfaces.find((item) => item.id === input.surfaceId);
  return lintDraft({
    body,
    banned: input.profile.bannedForPrompt,
    surfaceId: input.surfaceId,
    maxWords: surface?.maxWords,
  });
}

export async function generateDraft(
  input: {
    profile: Profile;
    surfaceId: string;
    facts: string;
    seed: string;
    golds: Pick<Gold, "id" | "title" | "body" | "surface" | "canonical">[];
    learnings: Pick<Learning, "rule" | "status">[];
  },
  complete: ChatComplete,
): Promise<{ body: string; bundle: string; retried: boolean; warnings: string[] }> {
  const user = buildUserPrompt(input);
  const first = unwrapDraft(await complete({ system: input.profile.systemPrompt, user }));
  const hits = draftHits(first, input);
  if (hits.length === 0) {
    return { body: first, bundle: user, retried: false, warnings: [] };
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
  };
}

export async function completeWithOpenAi(input: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Add OPENAI_API_KEY to Voice’s .env.");
  }
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create(
    {
      model: DRAFT_MODEL,
      temperature: input.temperature ?? DRAFT_TEMPERATURE,
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
