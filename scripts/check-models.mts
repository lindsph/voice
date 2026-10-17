// Pre-deploy model check. Usage: npx tsx scripts/check-models.mts [model ...]
// Checks Voice's own default model plus every model passed in (the pair deploy
// passes the ones WoolGrown Command sends). Exits 1 if any model fails.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]!] !== undefined) continue;
    process.env[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
}

const { checkModels, formatModelCheck, voiceOwnModels } = await import("../lib/model-check");

const results = await checkModels([...voiceOwnModels(), ...process.argv.slice(2)]);
console.log(formatModelCheck(results));
if (results.some((item) => !item.ok)) {
  console.error("Model check failed. Fix the model or request before deploying.");
  process.exit(1);
}
