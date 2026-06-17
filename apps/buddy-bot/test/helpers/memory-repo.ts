import {
  durationMinutes,
  median,
  type AbuseFlagRecord,
  type AuditEventRecord,
  type GiverOfferRecord,
  type GiverReliabilityStats,
  type MatchBundle,
  type MatchRecord,
  type SeekerRequestRecord,
  type UserRecord
} from "@codex-hud/core";
import type { BuddyRepository } from "../../src/services";

export class MemoryBuddyRepository implements BuddyRepository {
  configRows: Array<{ key: string; value_json: string }> = [];
  users: UserRecord[] = [];
  offers: GiverOfferRecord[] = [];
  seekers: SeekerRequestRecord[] = [];
  matches: MatchRecord[] = [];
  auditEvents: AuditEventRecord[] = [];
  abuseFlags: AbuseFlagRecord[] = [];
  confirmations: Array<{ matchId: string; userId: string; kind: string; createdAt: string }> = [];
  archivedCount = 0;

  constructor(users: UserRecord[] = []) {
    this.users = users;
  }

  async getConfigRows(): Promise<Array<{ key: string; value_json: string }>> {
    return this.configRows;
  }

  async createGiverOffer(input: Omit<GiverOfferRecord, "id">): Promise<GiverOfferRecord> {
    const offer = { ...input, id: `offer-${this.offers.length + 1}` };
    this.offers.push(offer);
    return offer;
  }

  async listActiveGiverOffers(): Promise<GiverOfferRecord[]> {
    return this.offers.filter((offer) => offer.state === "active" && offer.capacity_active > 0);
  }

  async listUserGiverOffers(userId: string): Promise<GiverOfferRecord[]> {
    return this.offers.filter((offer) => offer.user_id === userId);
  }

  async updateGiverOfferStateForUser(userId: string, fromStates: string[], state: string): Promise<number> {
    let count = 0;
    for (const offer of this.offers) {
      if (offer.user_id === userId && fromStates.includes(offer.state)) {
        offer.state = state as GiverOfferRecord["state"];
        count += 1;
      }
    }
    return count;
  }

  async createSeekerRequest(input: Omit<SeekerRequestRecord, "id">): Promise<SeekerRequestRecord> {
    const seeker = { ...input, id: `seeker-${this.seekers.length + 1}` };
    this.seekers.push(seeker);
    return seeker;
  }

  async getSeekerRequest(id: string): Promise<SeekerRequestRecord | null> {
    return this.seekers.find((seeker) => seeker.id === id) ?? null;
  }

  async listPendingSeekerRequests(): Promise<SeekerRequestRecord[]> {
    return this.seekers.filter((seeker) => seeker.state === "pending").sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  async findActiveSeekerByUser(userId: string): Promise<SeekerRequestRecord | null> {
    return this.seekers.find((seeker) => seeker.user_id === userId && ["pending", "reserved", "matched"].includes(seeker.state)) ?? null;
  }

  async findActiveSeekerByEmailHash(emailHash: string): Promise<SeekerRequestRecord | null> {
    return this.seekers.find((seeker) => seeker.email_hash === emailHash && ["pending", "reserved", "matched"].includes(seeker.state)) ?? null;
  }

  async findRecentSeekerByEmailHash(emailHash: string, cutoffIso: string): Promise<SeekerRequestRecord | null> {
    return (
      this.seekers
        .filter((seeker) => seeker.email_hash === emailHash && seeker.created_at >= cutoffIso)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null
    );
  }

  async countAuditEvents(actorUserId: string, eventType: string, sinceIso: string): Promise<number> {
    return this.auditEvents.filter(
      (event) => event.actor_user_id === actorUserId && event.event_type === eventType && event.created_at >= sinceIso
    ).length;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async createMatchReservation(input: {
    offer: GiverOfferRecord;
    seekerRequest: SeekerRequestRecord;
    reservedUntil: string;
    nowIso: string;
  }): Promise<MatchRecord> {
    const offer = this.offers.find((candidate) => candidate.id === input.offer.id);
    const seeker = this.seekers.find((candidate) => candidate.id === input.seekerRequest.id);
    if (!offer || !seeker) throw new Error("Missing match inputs");
    offer.capacity_active = Math.max(0, offer.capacity_active - 1);
    offer.state = offer.capacity_active === 0 ? "exhausted" : "active";
    seeker.state = "matched";
    const match: MatchRecord = {
      id: `match-${this.matches.length + 1}`,
      giver_offer_id: offer.id,
      seeker_request_id: seeker.id,
      state: "reserved",
      reserved_until: input.reservedUntil,
      invite_sent_at: null,
      seeker_received_at: null,
      seeker_completed_action_at: null,
      giver_confirmed_at: null,
      seeker_confirmed_at: null,
      closed_at: null,
      close_reason: null,
      created_at: input.nowIso
    };
    this.matches.push(match);
    return match;
  }

  async getMatchBundle(matchId: string): Promise<MatchBundle | null> {
    const match = this.matches.find((candidate) => candidate.id === matchId);
    if (!match) return null;
    const giverOffer = this.offers.find((offer) => offer.id === match.giver_offer_id);
    const seekerRequest = this.seekers.find((seeker) => seeker.id === match.seeker_request_id);
    if (!giverOffer || !seekerRequest) return null;
    const giverUser = this.users.find((user) => user.id === giverOffer.user_id);
    const seekerUser = this.users.find((user) => user.id === seekerRequest.user_id);
    if (!giverUser || !seekerUser) return null;
    return { match, giverOffer, seekerRequest, giverUser, seekerUser };
  }

  async updateMatch(match: MatchRecord): Promise<void> {
    const index = this.matches.findIndex((candidate) => candidate.id === match.id);
    if (index >= 0) this.matches[index] = match;
  }

  async completeSeekerRequest(id: string): Promise<void> {
    const seeker = this.seekers.find((candidate) => candidate.id === id);
    if (seeker) {
      seeker.state = "completed";
      seeker.email_ciphertext = null;
    }
  }

  async closeSeekerRequest(id: string, state: "cancelled" | "archived" | "blocked"): Promise<void> {
    const seeker = this.seekers.find((candidate) => candidate.id === id);
    if (seeker) {
      seeker.state = state;
      seeker.email_ciphertext = null;
    }
  }

  async clearSeekerEmailCiphertext(id: string): Promise<void> {
    const seeker = this.seekers.find((candidate) => candidate.id === id);
    if (seeker) seeker.email_ciphertext = null;
  }

  async clearExpiredEmailCiphertexts(cutoffIso: string): Promise<number> {
    let count = 0;
    for (const seeker of this.seekers) {
      if (seeker.email_ciphertext && seeker.created_at < cutoffIso) {
        seeker.email_ciphertext = null;
        count += 1;
      }
    }
    return count;
  }

  async restoreOfferCapacity(offerId: string): Promise<void> {
    const offer = this.offers.find((candidate) => candidate.id === offerId);
    if (!offer) return;
    offer.capacity_active = Math.min(offer.capacity_total, offer.capacity_active + 1);
    if (offer.capacity_active > 0 && offer.state !== "cancelled" && offer.state !== "archived") offer.state = "active";
  }

  async addConfirmation(matchId: string, userId: string, kind: string, nowIso: string): Promise<void> {
    if (!this.confirmations.some((entry) => entry.matchId === matchId && entry.userId === userId && entry.kind === kind)) {
      this.confirmations.push({ matchId, userId, kind, createdAt: nowIso });
    }
  }

  async addAuditEvent(input: Omit<AuditEventRecord, "id">): Promise<void> {
    this.auditEvents.push({ ...input, id: `audit-${this.auditEvents.length + 1}` });
  }

  async addAbuseFlag(input: Omit<AbuseFlagRecord, "id">): Promise<void> {
    this.abuseFlags.push({ ...input, id: `abuse-${this.abuseFlags.length + 1}` });
  }

  async getGiverReliabilityByOfferId(): Promise<Map<string, GiverReliabilityStats>> {
    return new Map(
      this.offers.map((offer) => [
        offer.id,
        {
          completed_matches: this.matches.filter((match) => match.giver_offer_id === offer.id && match.state === "completed").length,
          expired_reservations: this.matches.filter((match) => match.giver_offer_id === offer.id && match.state === "expired").length,
          reported_no_shows: this.matches.filter((match) => match.giver_offer_id === offer.id && match.close_reason === "giver_no_show").length,
          cooldown_until: null
        }
      ])
    );
  }

  async listStaleMatches(nowIso: string): Promise<MatchRecord[]> {
    return this.matches.filter(
      (match) => !["completed", "cancelled", "expired", "admin_resolved"].includes(match.state) && match.reserved_until < nowIso
    );
  }

  async archiveActiveIntents(_nowIso: string): Promise<number> {
    let count = 0;
    for (const offer of this.offers) {
      if (["active", "paused", "reserved"].includes(offer.state)) {
        offer.state = "archived";
        count += 1;
      }
    }
    for (const seeker of this.seekers) {
      if (["pending", "reserved", "matched"].includes(seeker.state)) {
        seeker.state = "archived";
        seeker.email_ciphertext = null;
        count += 1;
      }
    }
    this.archivedCount += count;
    return count;
  }

  metrics(): Record<string, number | null> {
    const completed = this.matches.filter((match) => match.state === "completed");
    return {
      completed_count: completed.length,
      median_completion_minutes: median(completed.map((match) => durationMinutes(match.created_at, match.closed_at)).filter(isNumber))
    };
  }
}

export function makeUser(id: string, telegramUserId: string): UserRecord {
  return {
    id,
    telegram_user_id: telegramUserId,
    username: null,
    first_name: null,
    role_summary: null,
    locale: "ru",
    created_at: "2026-06-01T00:00:00.000Z",
    blocked_at: null
  };
}

function isNumber(value: number | null): value is number {
  return typeof value === "number";
}
