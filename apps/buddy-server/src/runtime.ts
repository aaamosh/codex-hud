import { BuddyService, type ServiceSecrets } from "@codex-hud/buddy";
import { TelegramClient, type InlineKeyboardMarkup } from "@codex-hud/telegram";
import type { OutboxMessage } from "@codex-hud/core";
import type { D1BuddyRepository } from "@codex-hud/db";
import type { ServerEnv } from "./env";
import { SerialQueue } from "./serial-queue";

export function secretsFromServerEnv(env: ServerEnv): ServiceSecrets {
  return {
    emailEncryptionKey: env.EMAIL_ENCRYPTION_KEY,
    emailHashPepper: env.EMAIL_HASH_PEPPER
  };
}

export class BuddyNodeRuntime {
  readonly service: BuddyService;
  readonly telegram: TelegramClient;
  private readonly queue = new SerialQueue();

  constructor(
    readonly env: ServerEnv,
    readonly repo: D1BuddyRepository
  ) {
    this.service = new BuddyService(repo, secretsFromServerEnv(env));
    this.telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  }

  attemptMatch(seekerRequestId: string, options?: { notifyNoMatch?: boolean }): Promise<OutboxMessage[]> {
    return this.queue.run(() => this.service.attemptMatch(seekerRequestId, new Date(), options));
  }

  attemptPendingMatches(): Promise<OutboxMessage[]> {
    return this.queue.run(() => this.service.attemptPendingMatches());
  }

  matchAction(input: {
    matchId: string;
    action: "rel" | "gs" | "gcannot" | "sr" | "snr" | "sdone" | "cancel";
    actorUserId: string;
    actorChatId: string;
  }): Promise<OutboxMessage[]> {
    return this.queue.run(() => this.service.handleMatchAction(input));
  }

  expireStaleMatches(): Promise<number> {
    return this.queue.run(() => this.service.expireStaleMatches());
  }

  cleanupCiphertexts(): Promise<number> {
    return this.queue.run(() => this.service.cleanupCiphertexts());
  }

  archiveIfNeeded(): Promise<number> {
    return this.queue.run(() => this.service.archiveIfNeeded());
  }
}

export async function sendOutbox(
  telegram: TelegramClient,
  outbox: OutboxMessage[],
  afterSend?: (message: OutboxMessage) => Promise<void>
): Promise<void> {
  for (const message of outbox) {
    try {
      await telegram.sendMessage(message.chatId, message.text, { replyMarkup: message.replyMarkup as InlineKeyboardMarkup | undefined });
      await afterSend?.(message);
    } catch (error) {
      console.warn("telegram_delivery_failed", error instanceof Error ? error.message : String(error));
    }
  }
}
