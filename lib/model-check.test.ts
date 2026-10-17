import { describe, expect, it } from "vitest";

import { checkModels, formatModelCheck, uniqueModels, voiceOwnModels } from "./model-check";

describe("model check", () => {
  it("checks each model once, ignoring case and blanks", () => {
    expect(uniqueModels([" gpt-4o ", "GPT-4o", "", "claude-sonnet-5-5"])).toEqual([
      "gpt-4o",
      "claude-sonnet-5-5",
    ]);
  });

  it("includes Voice's own default draft model", () => {
    expect(voiceOwnModels().length).toBe(1);
    expect(voiceOwnModels()[0]).toBeTruthy();
  });

  it("reports a failing model with its error and keeps checking the rest", async () => {
    const results = await checkModels(["claude-sonnet-5-5", "gpt-4o"], async ({ model }) => {
      if (model === "claude-sonnet-5-5") {
        throw new Error("Claude draft failed (400): `temperature` is deprecated for this model.");
      }
      return "ok";
    });
    expect(results).toEqual([
      {
        model: "claude-sonnet-5-5",
        ok: false,
        detail: "Claude draft failed (400): `temperature` is deprecated for this model.",
      },
      { model: "gpt-4o", ok: true, detail: "ok" },
    ]);
    expect(formatModelCheck(results)).toBe(
      "FAIL claude-sonnet-5-5 — Claude draft failed (400): `temperature` is deprecated for this model.\nok   gpt-4o",
    );
  });
});
