import { Hono } from "hono";
import { D1BuddyRepository } from "@codex-hud/db";
import { TelegramClient, type TelegramUpdate } from "@codex-hud/telegram";
import type { OutboxMessage } from "@codex-hud/core";
import { adminRoutes } from "./admin/routes";
import type { Env } from "./env";
import { callMatchmaker, callMatchmakerCount, MatchmakerDurableObject } from "./matchmaker";
import { handleTelegramUpdate, sendOutbox } from "./telegram/handler";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("codex-hud/codex-buddy worker"));
app.get("/healthz", (c) => c.json({ ok: true, service: "codex-buddy" }));

app.post("/telegram/webhook", async (c) => {
  if (c.env.TELEGRAM_SECRET_TOKEN) {
    const received = c.req.header("x-telegram-bot-api-secret-token");
    if (received !== c.env.TELEGRAM_SECRET_TOKEN) return c.text("Unauthorized", 401);
  }

  const raw = await c.req.text();
  let update: TelegramUpdate;
  try {
    update = JSON.parse(raw) as TelegramUpdate;
  } catch {
    return c.text("Bad JSON", 400);
  }

  const repo = new D1BuddyRepository(c.env.DB);
  const accepted = await repo.markTelegramUpdate(update.update_id, await sha256Hex(raw), new Date().toISOString());
  if (!accepted) return c.json({ ok: true, duplicate: true });

  await handleTelegramUpdate(update, c.env, repo);
  return c.json({ ok: true });
});

app.route("/admin", adminRoutes);

export { MatchmakerDurableObject };

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const repo = new D1BuddyRepository(env.DB);
    const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

    for (const seeker of await repo.listPendingSeekerRequests()) {
      await safelySend(telegram, await callMatchmaker(env, "/attempt-match", { seekerRequestId: seeker.id, notifyNoMatch: false }));
    }

    await callMatchmakerCount(env, "/expire");
    await callMatchmakerCount(env, "/cleanup-email");
    await callMatchmakerCount(env, "/archive");
    await sendReminderNudges(repo, telegram);
  }
};

async function sendReminderNudges(repo: D1BuddyRepository, telegram: TelegramClient): Promise<void> {
  const now = new Date().toISOString();
  for (const match of await repo.listOpenMatches()) {
    if (await repo.hasAuditEvent("match", match.id, "reminder_sent_v1")) continue;
    const bundle = await repo.getMatchBundle(match.id);
    if (!bundle) continue;
    const messages: OutboxMessage[] = [];
    if (match.state === "reserved") {
      messages.push({
        chatId: bundle.giverUser.telegram_user_id,
        text: "Reminder: this match is reserved. Tap Show email, send the invite manually through the official OpenAI Codex flow, then mark the result."
      });
      messages.push({
        chatId: bundle.seekerUser.telegram_user_id,
        text: "Reminder: a giver is assigned, but the bot does not send OpenAI invite emails. Watch your inbox after the giver manually sends the invite."
      });
    } else if (match.state === "giver_sent" || match.state === "seeker_received" || match.state === "awaiting_final_confirmation") {
      messages.push({
        chatId: bundle.seekerUser.telegram_user_id,
        text: "Reminder: if you already accepted the invite and sent your first Codex message, confirm it with the match button."
      });
    }
    await safelySend(telegram, messages);
    await repo.addAuditEvent({
      actor_user_id: null,
      entity_type: "match",
      entity_id: match.id,
      event_type: "reminder_sent_v1",
      reason_code: null,
      metadata_json: null,
      created_at: now
    });
  }
}

async function safelySend(telegram: TelegramClient, outbox: OutboxMessage[]): Promise<void> {
  try {
    await sendOutbox(telegram, outbox);
  } catch {
    // Telegram delivery failures are retried by later user action or cron; never log payload text because it may contain relayed email.
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
