import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const mode = process.argv.includes("--remote") ? "--remote" : "--local";
const config = JSON.parse(await readFile(new URL("../config.sample.json", import.meta.url), "utf8")) as Record<string, unknown>;

for (const [key, value] of Object.entries(config)) {
  const sql =
    "INSERT INTO config (key, value_json, updated_at) VALUES (" +
    quote(key) +
    ", " +
    quote(JSON.stringify(value)) +
    ", datetime('now')) " +
    "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;";
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "codex_hud_buddy", mode, "--command", sql],
    { cwd: new URL("../apps/buddy-bot", import.meta.url), stdio: "inherit" }
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

