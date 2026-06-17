import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const appDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(appDir, "../../..");
export const sharedMigration = join(repoRoot, "packages/db/migrations/0001_initial.sql");
export const sampleConfig = join(repoRoot, "config.sample.json");
