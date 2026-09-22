import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("Voice stays a separate production app", () => {
  it("Fly app is lindsay-voice on 3030, not Command", () => {
    const toml = readFileSync(resolve(root, "fly.toml"), "utf8");
    expect(toml).toMatch(/app = 'lindsay-voice'/);
    expect(toml).toMatch(/internal_port = 3030/);
    expect(toml).toMatch(/HOSTNAME = '::'/);
    expect(toml).not.toMatch(/app = 'woolgrown-command'/);
  });

  it("pair deploy ships Voice before Command when Voice changed", () => {
    const script = readFileSync(resolve(root, "scripts/fly-deploy-pair.sh"), "utf8");
    expect(script).toMatch(/VOICE_APP="lindsay-voice"/);
    expect(script).toMatch(/COMMAND_APP="woolgrown-command"/);
    expect(script).toMatch(/voice_needs_deploy/);
    expect(script.indexOf("Deploying $VOICE_APP")).toBeLessThan(
      script.indexOf("Deploying $COMMAND_APP"),
    );
    expect(script).toMatch(
      /VOICE_URL=http:\/\/\$VOICE_APP\.internal:3030/,
    );
    expect(script).toMatch(/require_clean_pushed/);
    expect(script).toMatch(/Refuse: \$label has uncommitted files/);
    expect(script).toMatch(/Refuse: \$label HEAD is not the pushed tip/);
    expect(script).not.toMatch(
      /git -C "\$VOICE_ROOT" status --porcelain/,
    );
  });
});

