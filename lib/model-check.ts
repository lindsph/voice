/**
 * Pre-deploy model check: one tiny request per model, sent through the same
 * completeDraft path Voice uses for real drafts (temperature, effort, provider).
 * A retired model, a lost key, or a changed request rule fails here instead of
 * in front of Lindsey.
 */

import { completeDraft, DRAFT_MODEL } from "./generate";

export type ModelCheckResult = { model: string; ok: boolean; detail: string };

export type ModelCheckComplete = (input: { system: string; user: string; model: string }) => Promise<string>;

/** Models Voice uses on its own, before any caller asks for one. */
export function voiceOwnModels(): string[] {
  return [DRAFT_MODEL];
}

export function uniqueModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of models) {
    const model = raw.trim();
    if (!model || seen.has(model.toLowerCase())) continue;
    seen.add(model.toLowerCase());
    out.push(model);
  }
  return out;
}

export async function checkModels(
  models: string[],
  complete: ModelCheckComplete = (input) => completeDraft(input),
): Promise<ModelCheckResult[]> {
  return Promise.all(
    uniqueModels(models).map(async (model) => {
      try {
        const text = await complete({ system: "Reply with one word.", user: "Say ok.", model });
        return { model, ok: true, detail: text.trim().slice(0, 20) };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return { model, ok: false, detail: detail.replace(/\s+/g, " ").slice(0, 240) };
      }
    }),
  );
}

export function formatModelCheck(results: ModelCheckResult[]): string {
  return results
    .map((item) => `${item.ok ? "ok  " : "FAIL"} ${item.model}${item.ok ? "" : ` — ${item.detail}`}`)
    .join("\n");
}
