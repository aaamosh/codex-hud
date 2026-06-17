import { Hono } from "hono";
import type { D1BuddyRepository } from "@codex-hud/db";
import { createAdminRoutes } from "./admin";
import type { ServerEnv } from "./env";
import type { BuddyNodeRuntime } from "./runtime";
import { handleTelegramUpdate } from "./telegram-handler";
import type { TelegramUpdate } from "@codex-hud/telegram";

export function createBuddyServerApp(env: ServerEnv, repo: D1BuddyRepository, runtime: BuddyNodeRuntime): Hono {
  const app = new Hono();

  app.get("/", (c) => c.text("codex-hud/codex-buddy server4"));
  app.get("/healthz", (c) => c.json({ ok: true, service: "codex-buddy", runtime: "server4-node" }));

  app.post("/telegram/webhook", async (c) => {
    if (env.TELEGRAM_SECRET_TOKEN) {
      const received = c.req.header("x-telegram-bot-api-secret-token");
      if (received !== env.TELEGRAM_SECRET_TOKEN) return c.text("Unauthorized", 401);
    }

    const raw = await c.req.text();
    let update: TelegramUpdate;
    try {
      update = JSON.parse(raw) as TelegramUpdate;
    } catch {
      return c.text("Bad JSON", 400);
    }

    const accepted = await repo.markTelegramUpdate(update.update_id, await sha256Hex(raw), new Date().toISOString());
    if (!accepted) return c.json({ ok: true, duplicate: true });

    await handleTelegramUpdate(update, runtime);
    return c.json({ ok: true });
  });

  app.route("/admin", createAdminRoutes(repo, env.ADMIN_TOKEN));

  return app;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
