import { describe, expect, it } from "vitest";

import { productionServesPath } from "./public-surface";

describe("productionServesPath", () => {
  it("serves API routes only", () => {
    expect(productionServesPath("/api/profiles/woolgrown/bundle")).toBe(true);
    expect(productionServesPath("/api")).toBe(true);
    expect(productionServesPath("/")).toBe(false);
    expect(productionServesPath("/woolgrown")).toBe(false);
    expect(productionServesPath("/lindsay")).toBe(false);
  });
});
