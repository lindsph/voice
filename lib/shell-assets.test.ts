import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("desk shell assets", () => {
  it("loads Material Symbols with display=swap so a late font still replaces the names", () => {
    const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/family=Material\+Symbols\+Outlined/);
    expect(layout).toMatch(/display=swap/);
    expect(layout).not.toMatch(/display=optional/);
  });

  it("keeps pdf-parse external so the writing upload can read a PDF", () => {
    const config = readFileSync(resolve(root, "next.config.ts"), "utf8");
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(config).toMatch(/"pdf-parse"/);
    expect(pkg.dependencies["pdf-parse"]).toBeTruthy();
  });
});
