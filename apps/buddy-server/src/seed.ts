import { readFileSync } from "node:fs";
import { openServerDatabase } from "./db";
import { loadStorageEnv } from "./env";
import { sampleConfig } from "./paths";

const env = loadStorageEnv();
const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });

try {
  const config = JSON.parse(readFileSync(sampleConfig, "utf8")) as Record<string, unknown>;
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(config)) {
    await repo.setConfigValue(key, value, now);
  }
  console.log(JSON.stringify({ ok: true, seeded: Object.keys(config).length }));
} finally {
  db.close();
}
