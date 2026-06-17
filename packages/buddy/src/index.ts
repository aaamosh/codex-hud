import {
  addHoursIso,
  addMinutesIso,
  assertMatchingOpen,
  canCreateSeekerRequest,
  clampGiverCapacity,
  decryptEmail,
  encryptEmail,
  hashEmail,
  isValidEmail,
  maskEmail,
  nowIso,
  normalizeEmail,
  selectBestGiverOffer,
  transitionMatch,
  type BuddyRuntimeConfig,
  type GiverOfferRecord,
  type MatchBundle,
  type MatchRecord,
  type OutboxMessage,
  type PlanType,
  type SeekerRequestRecord,
  type UserRecord
} from "@codex-hud/core";
import { DEFAULT_CONFIG, mergeConfigRows } from "@codex-hud/config";
import { giverMatchKeyboard, seekerFinalKeyboard, seekerMatchKeyboard } from "@codex-hud/telegram";
import { inviteHelperTelegramNote } from "./invite-helper";

export interface BuddyRepository {
  getConfigRows(): Promise<Array<{ key: string; value_json: string }>>;
  createGiverOffer(input: Omit<GiverOfferRecord, "id">): Promise<GiverOfferRecord>;
  listActiveGiverOffers(): Promise<GiverOfferRecord[]>;
  listUserGiverOffers(userId: string): Promise<GiverOfferRecord[]>;
  updateGiverOfferStateForUser(userId: string, fromStates: string[], state: string): Promise<number>;
  createSeekerRequest(input: Omit<SeekerRequestRecord, "id">): Promise<SeekerRequestRecord>;
  getSeekerRequest(id: string): Promise<SeekerRequestRecord | null>;
  listPendingSeekerRequests(): Promise<SeekerRequestRecord[]>;
  findActiveSeekerByUser(userId: string): Promise<SeekerRequestRecord | null>;
  findActiveSeekerByEmailHash(emailHash: string): Promise<SeekerRequestRecord | null>;
  findRecentSeekerByEmailHash(emailHash: string, cutoffIso: string): Promise<SeekerRequestRecord | null>;
  countAuditEvents(actorUserId: string, eventType: string, sinceIso: string): Promise<number>;
  getUserById(id: string): Promise<UserRecord | null>;
  createMatchReservation(input: {
    offer: GiverOfferRecord;
    seekerRequest: SeekerRequestRecord;
    reservedUntil: string;
    nowIso: string;
  }): Promise<MatchRecord>;
  getMatchBundle(matchId: string): Promise<MatchBundle | null>;
  updateMatch(match: MatchRecord): Promise<void>;
  completeSeekerRequest(id: string): Promise<void>;
  closeSeekerRequest(id: string, state: "cancelled" | "archived" | "blocked"): Promise<void>;
  clearSeekerEmailCiphertext(id: string): Promise<void>;
  clearExpiredEmailCiphertexts(cutoffIso: string): Promise<number>;
  restoreOfferCapacity(offerId: string): Promise<void>;
  addConfirmation(matchId: string, userId: string, kind: string, nowIso: string): Promise<void>;
  addAuditEvent(input: {
    actor_user_id: string | null;
    entity_type: string;
    entity_id: string;
    event_type: string;
    reason_code: string | null;
    metadata_json: string | null;
    created_at: string;
  }): Promise<void>;
  addAbuseFlag(input: {
    user_id: string | null;
    email_hash: string | null;
    reason_code: string;
    notes: string | null;
    created_at: string;
  }): Promise<void>;
  getGiverReliabilityByOfferId(): Promise<Map<string, { completed_matches: number; expired_reservations: number; reported_no_shows: number; cooldown_until: string | null }>>;
  listStaleMatches(nowIso: string): Promise<MatchRecord[]>;
  archiveActiveIntents(nowIso: string): Promise<number>;
}

export interface ServiceSecrets {
  emailEncryptionKey: string;
  emailHashPepper: string;
}

export interface CreateGiverOfferInput {
  user: UserRecord;
  planType: PlanType;
  language: string;
  region: string;
  timezone: string;
  capacityRequested: number;
  now?: Date;
}

export interface CreateSeekerRequestInput {
  user: UserRecord;
  language: string;
  region: string;
  timezone: string;
  email: string;
  availabilityWindowMinutes: number;
  now?: Date;
}

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; message: string; reason?: string };

export class BuddyService {
  constructor(
    private readonly repo: BuddyRepository,
    private readonly secrets: ServiceSecrets
  ) {}

  async getConfig(): Promise<BuddyRuntimeConfig> {
    const rows = await this.repo.getConfigRows();
    if (rows.length === 0) return DEFAULT_CONFIG;
    return mergeConfigRows(rows);
  }

  async createGiverOffer(input: CreateGiverOfferInput): Promise<ServiceResult<GiverOfferRecord>> {
    const createdAt = nowIso(input.now);
    const config = await this.getConfig();
    const open = assertMatchingOpen(config, input.now ?? new Date());
    if (!open.ok) return { ok: false, message: open.message, reason: "archive_mode" };
    if (input.user.blocked_at) return { ok: false, message: "User is blocked.", reason: "blocked" };

    const capacity = clampGiverCapacity(config.max_giver_capacity_by_plan[input.planType], input.capacityRequested);
    const replacedOffers = await this.repo.updateGiverOfferStateForUser(input.user.id, ["active", "paused"], "cancelled");
    const offer = await this.repo.createGiverOffer({
      user_id: input.user.id,
      plan_type: input.planType,
      language: normalizeShort(input.language),
      region: input.region.trim(),
      timezone: input.timezone.trim(),
      capacity_total: capacity,
      capacity_active: capacity,
      state: "active",
      created_at: createdAt,
      expires_at: null
    });
    await this.repo.addAuditEvent({
      actor_user_id: input.user.id,
      entity_type: "giver_offer",
      entity_id: offer.id,
      event_type: "giver_offer_created",
      reason_code: null,
      metadata_json: JSON.stringify({ capacity, replaced_open_offers: replacedOffers }),
      created_at: createdAt
    });
    return { ok: true, value: offer };
  }

  async createSeekerRequest(input: CreateSeekerRequestInput): Promise<ServiceResult<SeekerRequestRecord>> {
    const createdAt = nowIso(input.now);
    const config = await this.getConfig();
    const open = assertMatchingOpen(config, input.now ?? new Date());
    if (!open.ok) return { ok: false, message: open.message, reason: "archive_mode" };
    if (input.user.blocked_at) return { ok: false, message: "User is blocked.", reason: "blocked" };
    if (!isValidEmail(input.email)) return { ok: false, message: "That does not look like an email. Check the format and send it again.", reason: "invalid_email" };

    const emailHash = await hashEmail(input.email, this.secrets.emailHashPepper);
    const cooldownCutoff = addHoursIso(createdAt, -config.seeker_email_cooldown_hours);
    const cancelCutoff = addMinutesIso(createdAt, -config.cancel_spam_cooldown_minutes);
    const decision = canCreateSeekerRequest({
      existingActiveByUser: await this.repo.findActiveSeekerByUser(input.user.id),
      existingActiveByEmail: await this.repo.findActiveSeekerByEmailHash(emailHash),
      recentByEmailWithinCooldown: await this.repo.findRecentSeekerByEmailHash(emailHash, cooldownCutoff),
      recentCancelEventsInWindow: await this.repo.countAuditEvents(input.user.id, "user_cancelled", cancelCutoff),
      config
    });

    if (!decision.ok) {
      await this.repo.addAbuseFlag({
        user_id: input.user.id,
        email_hash: emailHash,
        reason_code: decision.reason,
        notes: null,
        created_at: createdAt
      });
      return { ok: false, message: decision.message, reason: decision.reason };
    }

    const request = await this.repo.createSeekerRequest({
      user_id: input.user.id,
      language: normalizeShort(input.language),
      region: input.region.trim(),
      timezone: input.timezone.trim(),
      email_hash: emailHash,
      email_masked: maskEmail(input.email),
      email_ciphertext: await encryptEmail(input.email, this.secrets.emailEncryptionKey),
      availability_window_minutes: input.availabilityWindowMinutes,
      state: "pending",
      created_at: createdAt,
      expires_at: null
    });
    await this.repo.addAuditEvent({
      actor_user_id: input.user.id,
      entity_type: "seeker_request",
      entity_id: request.id,
      event_type: "seeker_request_created",
      reason_code: null,
      metadata_json: JSON.stringify({ email_hash: emailHash }),
      created_at: createdAt
    });
    return { ok: true, value: request };
  }

  async attemptMatch(seekerRequestId: string, now: Date = new Date(), options: { notifyNoMatch?: boolean } = {}): Promise<OutboxMessage[]> {
    const currentIso = nowIso(now);
    const notifyNoMatch = options.notifyNoMatch ?? true;
    const config = await this.getConfig();
    const seeker = await this.repo.getSeekerRequest(seekerRequestId);
    if (!seeker || seeker.state !== "pending") return [];

    const seekerUser = await this.repo.getUserById(seeker.user_id);
    if (!seekerUser || seekerUser.blocked_at) return [];

    const open = assertMatchingOpen(config, now);
    if (!open.ok) {
      return [{ chatId: seekerUser.telegram_user_id, text: open.message }];
    }

    const allActiveOffers = await this.repo.listActiveGiverOffers();
    const ownActiveOffers = allActiveOffers.filter((offer) => offer.user_id === seeker.user_id);
    const offers = allActiveOffers.filter((offer) => offer.user_id !== seeker.user_id);
    const reliability = await this.repo.getGiverReliabilityByOfferId();
    const best = selectBestGiverOffer(seeker, offers, reliability, now);
    if (!best) {
      if (!notifyNoMatch) return [];
      return [
        {
          chatId: seekerUser.telegram_user_id,
          text:
            ownActiveOffers.length > 0
              ? "Request accepted. Your own giver offer cannot match this request because self-referrals are not allowed. I will keep looking for another giver."
              : "Request accepted. No eligible giver is available yet; I will try again on the next event or cron pass."
        }
      ];
    }

    const match = await this.repo.createMatchReservation({
      offer: best.offer,
      seekerRequest: seeker,
      reservedUntil: addMinutesIso(currentIso, config.reservation_ttl_minutes),
      nowIso: currentIso
    });
    const bundle = await this.repo.getMatchBundle(match.id);
    if (!bundle) return [];

    await this.repo.addAuditEvent({
      actor_user_id: null,
      entity_type: "match",
      entity_id: match.id,
      event_type: "match_reserved",
      reason_code: null,
      metadata_json: JSON.stringify({ score: best.score, reasons: best.reasons }),
      created_at: currentIso
    });

    return [
      {
        chatId: bundle.giverUser.telegram_user_id,
        text:
          `New match for the official Codex invite flow.\n\n` +
          `Seeker: ${bundle.seekerRequest.email_masked}\n\n` +
          `Next steps:\n` +
          `1. Tap "Show email".\n` +
          `2. Send the invite manually through the official OpenAI Codex flow.\n` +
          `3. Come back here and tap "Invite sent".\n\n` +
          `The bot does not send OpenAI invite emails automatically.`,
        replyMarkup: giverMatchKeyboard(match.id, Boolean(bundle.seekerRequest.email_ciphertext))
      },
      {
        chatId: bundle.seekerUser.telegram_user_id,
        text:
          `A giver was found.\n\n` +
          `No OpenAI invite email has been sent by the bot. The giver now needs to reveal your email and send the invite manually through the official OpenAI Codex flow.\n\n` +
          `When the giver marks "Invite sent", check your inbox and complete the official flow as soon as you can.`,
        replyMarkup: seekerMatchKeyboard(match.id)
      }
    ];
  }

  async attemptPendingMatches(now: Date = new Date()): Promise<OutboxMessage[]> {
    const outbox: OutboxMessage[] = [];
    for (const seeker of await this.repo.listPendingSeekerRequests()) {
      outbox.push(...await this.attemptMatch(seeker.id, now));
    }
    return outbox;
  }

  async handleMatchAction(input: {
    matchId: string;
    action: "rel" | "gs" | "gcannot" | "sr" | "snr" | "sdone" | "cancel";
    actorUserId: string;
    actorChatId: string;
    now?: Date;
  }): Promise<OutboxMessage[]> {
    const currentIso = nowIso(input.now);
    const bundle = await this.repo.getMatchBundle(input.matchId);
    if (!bundle) return [];

    const role = actorRole(bundle, input.actorUserId);
    if (!role) {
      return [{ chatId: input.actorChatId, text: "This match is not linked to your Telegram ID." }];
    }

    if (input.action === "rel" && role !== "giver") return [notForYou(input.actorChatId)];
    if (input.action === "rel") return this.relayEmail(bundle, input.actorUserId, currentIso);
    if (input.action === "gs" && role !== "giver") return [notForYou(input.actorChatId)];
    if ((input.action === "sr" || input.action === "snr" || input.action === "sdone") && role !== "seeker") return [notForYou(input.actorChatId)];
    if (input.action === "gcannot" && role !== "giver") return [notForYou(input.actorChatId)];

    if (input.action === "gcannot" || input.action === "snr" || input.action === "cancel") {
      const reason = input.action === "gcannot" ? "giver_cannot_send" : input.action === "snr" ? "seeker_did_not_receive" : "user_cancelled";
      const transitioned = transitionMatch(bundle.match, { action: "cancel", nowIso: currentIso, reason });
      if (!transitioned.changed) return [{ chatId: input.actorUserId, text: "Already recorded." }];
      await this.repo.updateMatch(transitioned.match);
      await this.repo.closeSeekerRequest(bundle.seekerRequest.id, "cancelled");
      if (!bundle.match.invite_sent_at) await this.repo.restoreOfferCapacity(bundle.giverOffer.id);
      await this.repo.addAuditEvent({
        actor_user_id: input.actorUserId,
        entity_type: "match",
        entity_id: bundle.match.id,
        event_type: "user_cancelled",
        reason_code: reason,
        metadata_json: null,
        created_at: currentIso
      });
      return [
        { chatId: bundle.giverUser.telegram_user_id, text: "Match cancelled. Thanks for updating the status." },
        { chatId: bundle.seekerUser.telegram_user_id, text: "Match cancelled. You can create a new request with /seek if the promo window is open." }
      ];
    }

    const transition =
      input.action === "gs"
        ? transitionMatch(bundle.match, { action: "giver_sent", nowIso: currentIso })
        : input.action === "sr"
          ? transitionMatch(bundle.match, { action: "seeker_received", nowIso: currentIso })
          : transitionMatch(bundle.match, { action: "seeker_completed", nowIso: currentIso });

    if (!transition.changed) return [{ chatId: input.actorUserId, text: "Already recorded." }];
    await this.repo.updateMatch(transition.match);

    if (input.action === "gs") await this.repo.addConfirmation(bundle.match.id, bundle.giverUser.id, "giver_sent", currentIso);
    if (input.action === "sr") await this.repo.addConfirmation(bundle.match.id, bundle.seekerUser.id, "seeker_received", currentIso);
    if (input.action === "sdone") await this.repo.addConfirmation(bundle.match.id, bundle.seekerUser.id, "seeker_completed", currentIso);

    if (transition.match.state === "completed") {
      await this.repo.completeSeekerRequest(bundle.seekerRequest.id);
      return [
        { chatId: bundle.giverUser.telegram_user_id, text: "Done: both sides confirmed completion. Thanks for helping." },
        { chatId: bundle.seekerUser.telegram_user_id, text: "Done: match closed as completed. Enjoy Codex." }
      ];
    }

    if (input.action === "gs") {
      return [
        { chatId: bundle.giverUser.telegram_user_id, text: "Recorded. Now waiting for the seeker confirmation." },
        { chatId: bundle.seekerUser.telegram_user_id, text: "The giver marked the invite as sent. Check your inbox and spam folder, then confirm receipt.", replyMarkup: seekerMatchKeyboard(bundle.match.id) }
      ];
    }
    if (input.action === "sr") {
      return [
        { chatId: bundle.seekerUser.telegram_user_id, text: "Great. Now accept the invite, open Codex, and send your first message.", replyMarkup: seekerFinalKeyboard(bundle.match.id) },
        { chatId: bundle.giverUser.telegram_user_id, text: "The seeker marked the invite as received. Waiting for final confirmation after the first Codex message." }
      ];
    }
    return [{ chatId: bundle.seekerUser.telegram_user_id, text: "Final step recorded. Waiting for giver-side confirmation if it has not arrived yet." }];
  }

  async expireStaleMatches(now: Date = new Date()): Promise<number> {
    const currentIso = nowIso(now);
    const stale = await this.repo.listStaleMatches(currentIso);
    let count = 0;
    for (const match of stale) {
      const transitioned = transitionMatch(match, { action: "expire", nowIso: currentIso, reason: "reservation_expired" });
      if (!transitioned.changed) continue;
      await this.repo.updateMatch(transitioned.match);
      const bundle = await this.repo.getMatchBundle(match.id);
      if (bundle) {
        await this.repo.closeSeekerRequest(bundle.seekerRequest.id, "cancelled");
        if (!match.invite_sent_at) await this.repo.restoreOfferCapacity(bundle.giverOffer.id);
      }
      count += 1;
    }
    return count;
  }

  async cleanupCiphertexts(now: Date = new Date()): Promise<number> {
    const config = await this.getConfig();
    return this.repo.clearExpiredEmailCiphertexts(addMinutesIso(now, -config.plaintext_relay_ttl_minutes));
  }

  async archiveIfNeeded(now: Date = new Date()): Promise<number> {
    const config = await this.getConfig();
    const open = assertMatchingOpen(config, now);
    if (open.ok) return 0;
    return this.repo.archiveActiveIntents(nowIso(now));
  }

  private async relayEmail(bundle: MatchBundle, actorUserId: string, currentIso: string): Promise<OutboxMessage[]> {
    if (actorUserId !== bundle.giverUser.id) return [notForYou(actorUserId)];
    if (!bundle.seekerRequest.email_ciphertext) {
      return [{ chatId: bundle.giverUser.telegram_user_id, text: "Email was already relayed or the relay window was cleared. Only masked email remains in the admin UI." }];
    }
    const email = await decryptEmail(bundle.seekerRequest.email_ciphertext, this.secrets.emailEncryptionKey);
    await this.repo.addAuditEvent({
      actor_user_id: actorUserId,
      entity_type: "match",
      entity_id: bundle.match.id,
      event_type: "email_relayed_once",
      reason_code: null,
      metadata_json: JSON.stringify({ email_hash: bundle.seekerRequest.email_hash }),
      created_at: currentIso
    });
    return [
      {
        chatId: bundle.giverUser.telegram_user_id,
        text:
          `Email for the official OpenAI Codex invite flow:\n${normalizeEmail(email)}\n\n` +
          `Use it only to manually send an invite in the official OpenAI flow. After this message is delivered, the bot will clear the encrypted copy.\n\n` +
          inviteHelperTelegramNote(),
        afterSend: {
          clearSeekerEmailCiphertextId: bundle.seekerRequest.id
        }
      }
    ];
  }
}

function actorRole(bundle: MatchBundle, actorUserId: string): "giver" | "seeker" | null {
  if (bundle.giverUser.id === actorUserId) return "giver";
  if (bundle.seekerUser.id === actorUserId) return "seeker";
  return null;
}

function notForYou(chatId: string): OutboxMessage {
  return { chatId, text: "This button is for the other side of the match." };
}

function normalizeShort(value: string): string {
  return value.trim().toLowerCase();
}
