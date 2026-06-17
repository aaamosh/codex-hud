import { openServerDatabase } from "./db";
import { loadEnv } from "./env";
import { BuddyNodeRuntime, sendOutbox } from "./runtime";
import type { OutboxMessage } from "@codex-hud/core";

const env = loadEnv();
const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
const runtime = new BuddyNodeRuntime(env, repo);

try {
  for (const seeker of await repo.listPendingSeekerRequests()) {
    await safelySend(await runtime.attemptMatch(seeker.id, { notifyNoMatch: false }));
  }

  const expired = await runtime.expireStaleMatches();
  const cleanedCiphertexts = await runtime.cleanupCiphertexts();
  const archived = await runtime.archiveIfNeeded();
  const reminders = await sendReminderNudges(runtime);

  console.log(JSON.stringify({ ok: true, expired, cleanedCiphertexts, archived, reminders }));
} finally {
  db.close();
}

async function sendReminderNudges(runtime: BuddyNodeRuntime): Promise<number> {
  const now = new Date().toISOString();
  let sent = 0;
  for (const match of await runtime.repo.listOpenMatches()) {
    if (await runtime.repo.hasAuditEvent("match", match.id, "reminder_sent_v1")) continue;
    const bundle = await runtime.repo.getMatchBundle(match.id);
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
    await safelySend(messages);
    await runtime.repo.addAuditEvent({
      actor_user_id: null,
      entity_type: "match",
      entity_id: match.id,
      event_type: "reminder_sent_v1",
      reason_code: null,
      metadata_json: null,
      created_at: now
    });
    sent += messages.length;
  }
  return sent;
}

async function safelySend(outbox: OutboxMessage[]): Promise<void> {
  try {
    await sendOutbox(runtime.telegram, outbox);
  } catch (error) {
    console.warn("telegram_delivery_failed", error instanceof Error ? error.message : String(error));
  }
}
