import { serve } from "@hono/node-server";
import { createBuddyServerApp } from "./app";
import { openServerDatabase } from "./db";
import { loadEnv } from "./env";
import { BuddyNodeRuntime } from "./runtime";

const env = loadEnv();
const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
const runtime = new BuddyNodeRuntime(env, repo);
const app = createBuddyServerApp(env, repo, runtime);

serve(
  {
    fetch: app.fetch,
    hostname: env.BUDDY_HOST,
    port: env.BUDDY_PORT
  },
  (info) => {
    console.log(`codex-buddy server listening on http://${info.address}:${info.port}`);
  }
);

function shutdown(): void {
  db.close();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
