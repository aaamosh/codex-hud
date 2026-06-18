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
  const now = new Date();
  const nowIso = now.toISOString();
  let sent = 0;
  const FINAL_NUDGE_WINDOW_MS = 30 * 60 * 1000;
  for (const match of await runtime.repo.listOpenMatches()) {
    const bundle = await runtime.repo.getMatchBundle(match.id);
    if (!bundle) continue;
    const hasV1 = await runtime.repo.hasAuditEvent("match", match.id, "reminder_sent_v1");
    const hasFinal = await runtime.repo.hasAuditEvent("match", match.id, "reminder_sent_final");
    const reservedUntil = Date.parse(match.reserved_until);
    const timeLeftMs = Number.isFinite(reservedUntil) ? reservedUntil - now.getTime() : Number.POSITIVE_INFINITY;
    const isReservedState = match.state === "reserved";
    const inFinalWindow = isReservedState && timeLeftMs > 0 && timeLeftMs <= FINAL_NUDGE_WINDOW_MS;
    let kind: "v1" | "final" | null = null;
    if (inFinalWindow && !hasFinal) kind = "final";
    else if (!hasV1) kind = "v1";
    if (!kind) continue;
    const messages: OutboxMessage[] = [];
    if (match.state === "reserved") {
      if (kind === "final") {
        const minsLeft = Math.max(1, Math.round(timeLeftMs / 60000));
        messages.push({
          chatId: bundle.giverUser.telegram_user_id,
          text: `Final nudge: this match auto-expires in about ${minsLeft} minutes. If you can't send the invite now, tap "I can't send" so the seeker can re-queue. Otherwise: Show email → send invite → tap "Invite sent".`
        });
        messages.push({
          chatId: bundle.seekerUser.telegram_user_id,
          text: `Final nudge: the reservation auto-expires in about ${minsLeft} minutes. If the giver doesn't act, the bot will release you to a new match — no action needed from you.`
        });
      } else {
        messages.push({
          chatId: bundle.giverUser.telegram_user_id,
          text: "Reminder: this match is reserved. Tap Show email, send the invite manually through the official OpenAI Codex flow, then mark the result."
        });
        messages.push({
          chatId: bundle.seekerUser.telegram_user_id,
          text: "Reminder: a giver is assigned, but the bot does not send OpenAI invite emails. Watch your inbox after the giver manually sends the invite."
        });
      }
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
      event_type: kind === "final" ? "reminder_sent_final" : "reminder_sent_v1",
      reason_code: null,
      metadata_json: null,
      created_at: nowIso
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
