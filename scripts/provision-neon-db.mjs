import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const woolgrownEnv = "/Volumes/dev/personal/alpha/web/.env";
const targetEnv = path.join(process.cwd(), ".env");

function readEnv(file) {
  const values = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, "");
  }
  return values;
}

function swapDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function psql(url, sql) {
  return spawnSync("/opt/homebrew/opt/libpq/bin/psql", [url, "-v", "ON_ERROR_STOP=1", "-tAc", sql], {
    encoding: "utf8",
  });
}

const source = readEnv(woolgrownEnv);
const pooled = source.DATABASE_URL || source.NEON_DATABASE_URL;
const direct = source.DIRECT_URL || source.NEON_DIRECT_URL;
if (!pooled || !direct) {
  throw new Error("WoolGrown Neon URLs are missing.");
}

const exists = psql(direct, "SELECT 1 FROM pg_database WHERE datname = 'voice'");
if (exists.status !== 0) {
  console.error(exists.stderr || "Could not inspect Neon databases.");
  process.exit(1);
}

if (!exists.stdout.includes("1")) {
  const created = psql(direct, "CREATE DATABASE voice");
  if (created.status !== 0) {
    console.error(created.stderr || created.stdout || "CREATE DATABASE failed");
    process.exit(1);
  }
  console.log("Created Neon database voice");
} else {
  console.log("Neon database voice already exists");
}

const openai = source.OPENAI_API_KEY ? `OPENAI_API_KEY="${source.OPENAI_API_KEY}"` : 'OPENAI_API_KEY=""';

writeFileSync(
  targetEnv,
  [
    "# Dedicated Neon database. Do not point this at showroom neondb, lindsay, or woolgrown.",
    `DATABASE_URL="${swapDatabase(pooled, "voice")}"`,
    `DIRECT_URL="${swapDatabase(direct, "voice")}"`,
    openai,
    'VOICE_API_SECRET=""',
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log("Wrote .env for the voice database");
