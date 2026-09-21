import { describe, expect, it } from "vitest";

import { parseTeachFlag, voiceIntegrationTeaches } from "./teach";

describe("voiceIntegrationTeaches", () => {
  it("lets lindsay-assistant teach on every host unless the lever is off", () => {
    expect(
      voiceIntegrationTeaches({ nodeEnv: "development", defaultMode: "always" }),
    ).toBe(true);
    expect(
      voiceIntegrationTeaches({
        nodeEnv: "development",
        voiceTeach: "off",
        defaultMode: "always",
      }),
    ).toBe(false);
  });

  it("keeps WoolGrown local silent unless the lever is on", () => {
    expect(
      voiceIntegrationTeaches({
        nodeEnv: "development",
        defaultMode: "production",
      }),
    ).toBe(false);
    expect(
      voiceIntegrationTeaches({
        nodeEnv: "production",
        defaultMode: "production",
      }),
    ).toBe(true);
    expect(
      voiceIntegrationTeaches({
        nodeEnv: "development",
        voiceTeach: "1",
        defaultMode: "production",
      }),
    ).toBe(true);
    expect(
      voiceIntegrationTeaches({
        nodeEnv: "production",
        voiceTeach: "0",
        defaultMode: "production",
      }),
    ).toBe(false);
  });

  it("parses the env lever", () => {
    expect(parseTeachFlag("on")).toBe(true);
    expect(parseTeachFlag("OFF")).toBe(false);
    expect(parseTeachFlag("")).toBeNull();
  });
});
