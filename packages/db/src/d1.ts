import {
  durationMinutes,
  median,
  type AbuseFlagRecord,
  type AuditEventRecord,
  type BuddyRuntimeConfig,
  type GiverOfferRecord,
  type GiverReliabilityStats,
  type MatchBundle,
  type MatchRecord,
  type OutboxMessage,
  type SeekerRequestRecord,
  type UserRecord
} from "@codex-hud/core";

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch?<T = unknown>(statements: D1PreparedStatementLike[]): Promise<Array<{ results?: T[]; success: boolean }>>;
}

export interface TelegramUserInput {
  telegram_user_id: string;
  username: string | null;
  first_name: string | null;
  locale: string | null;
}

export interface ConversationState {
  flow: string;
  step: string;
  data: Record<string, unknown>;
}

export interface AdminSnapshot {
  activeGiverOffers: GiverOfferRecord[];
  activeSeekerRequests: SeekerRequestRecord[];
  matches: MatchBundle[];
  metrics: Record<string, number | null>;
}

export class D1BuddyRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async getConfigRows(): Promise<Array<{ key: string; value_json: string }>> {
    const result = await this.db.prepare("SELECT key, value_json FROM config").all<{ key: string; value_json: string }>();
    return result.results;
  }

  async setConfigValue(key: string, value: unknown, nowIso: string): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO config (key, value_json, updated_at) VALUES (?1, ?2, ?3) " +
          "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at"
      )
      .bind(key, JSON.stringify(value), nowIso)
      .run();
  }

  async markTelegramUpdate(updateId: number, payloadHash: string, nowIso: string): Promise<boolean> {
    const existing = await this.db
      .prepare("SELECT update_id FROM telegram_updates WHERE update_id = ?1")
      .bind(updateId)
      .first<{ update_id: number }>();
    if (existing) return false;
    try {
      await this.db
        .prepare("INSERT INTO telegram_updates (update_id, payload_hash, processed_at) VALUES (?1, ?2, ?3)")
        .bind(updateId, payloadHash, nowIso)
        .run();
      return true;
    } catch {
      return false;
    }
  }

  async upsertTelegramUser(input: TelegramUserInput, nowIso: string): Promise<UserRecord> {
    const existing = await this.getUserByTelegramId(input.telegram_user_id);
    if (existing) {
      await this.db
        .prepare("UPDATE users SET username = ?1, first_name = ?2, locale = ?3 WHERE id = ?4")
        .bind(input.username, input.first_name, input.locale, existing.id)
        .run();
      return { ...existing, username: input.username, first_name: input.first_name, locale: input.locale };
    }
    const user: UserRecord = {
      id: crypto.randomUUID(),
      telegram_user_id: input.telegram_user_id,
      username: input.username,
      first_name: input.first_name,
      role_summary: null,
      locale: input.locale,
      created_at: nowIso,
      blocked_at: null
    };
    await this.db
      .prepare(
        "INSERT INTO users (id, telegram_user_id, username, first_name, role_summary, locale, created_at, blocked_at) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
      )
      .bind(
        user.id,
        user.telegram_user_id,
        user.username,
        user.first_name,
        user.role_summary,
        user.locale,
        user.created_at,
        user.blocked_at
      )
      .run();
    return user;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    return this.db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRecord>();
  }

  async getUserByTelegramId(telegramUserId: string): Promise<UserRecord | null> {
    return this.db.prepare("SELECT * FROM users WHERE telegram_user_id = ?1").bind(telegramUserId).first<UserRecord>();
  }

  async blockUser(userId: string, nowIso: string | null): Promise<void> {
    await this.db.prepare("UPDATE users SET blocked_at = ?1 WHERE id = ?2").bind(nowIso, userId).run();
  }

  async setConversation(userId: string, state: ConversationState, nowIso: string): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO conversation_states (user_id, flow, step, data_json, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) " +
          "ON CONFLICT(user_id) DO UPDATE SET flow = excluded.flow, step = excluded.step, data_json = excluded.data_json, updated_at = excluded.updated_at"
      )
      .bind(userId, state.flow, state.step, JSON.stringify(state.data), nowIso)
      .run();
  }

  async getConversation(userId: string): Promise<ConversationState | null> {
    const row = await this.db
      .prepare("SELECT flow, step, data_json FROM conversation_states WHERE user_id = ?1")
      .bind(userId)
      .first<{ flow: string; step: string; data_json: string }>();
    if (!row) return null;
    return { flow: row.flow, step: row.step, data: JSON.parse(row.data_json) as Record<string, unknown> };
  }

  async clearConversation(userId: string): Promise<void> {
    await this.db.prepare("DELETE FROM conversation_states WHERE user_id = ?1").bind(userId).run();
  }

  async createGiverOffer(input: Omit<GiverOfferRecord, "id">): Promise<GiverOfferRecord> {
    const offer: GiverOfferRecord = { ...input, id: crypto.randomUUID() };
    await this.db
      .prepare(
        "INSERT INTO giver_offers (id, user_id, plan_type, language, region, timezone, capacity_total, capacity_active, state, created_at, expires_at) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
      )
      .bind(
        offer.id,
        offer.user_id,
        offer.plan_type,
        offer.language,
        offer.region,
        offer.timezone,
        offer.capacity_total,
        offer.capacity_active,
        offer.state,
        offer.created_at,
        offer.expires_at
      )
      .run();
    return offer;
  }

  async listActiveGiverOffers(): Promise<GiverOfferRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM giver_offers WHERE state = 'active' AND capacity_active > 0 ORDER BY created_at DESC")
      .all<GiverOfferRecord>();
    return result.results;
  }

  async listUserGiverOffers(userId: string): Promise<GiverOfferRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM giver_offers WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 20")
      .bind(userId)
      .all<GiverOfferRecord>();
    return result.results;
  }

  async updateGiverOfferStateForUser(userId: string, fromStates: string[], state: string): Promise<number> {
    if (fromStates.length === 0) return 0;
    const placeholders = fromStates.map((_, index) => `?${index + 2}`).join(", ");
    const result = await this.db
      .prepare(`UPDATE giver_offers SET state = ?1 WHERE user_id = ?${fromStates.length + 2} AND state IN (${placeholders})`)
      .bind(state, ...fromStates, userId)
      .run();
    return Number(result.meta?.changes ?? 0);
  }

  async cancelActiveSeekerRequestsForUser(userId: string): Promise<number> {
    const result = await this.db
      .prepare("UPDATE seeker_requests SET state = 'cancelled', email_ciphertext = NULL WHERE user_id = ?1 AND state IN ('pending', 'reserved', 'matched')")
      .bind(userId)
      .run();
    return Number(result.meta?.changes ?? 0);
  }

  async createSeekerRequest(input: Omit<SeekerRequestRecord, "id">): Promise<SeekerRequestRecord> {
    const request: SeekerRequestRecord = { ...input, id: crypto.randomUUID() };
    await this.db
      .prepare(
        "INSERT INTO seeker_requests (id, user_id, language, region, timezone, email_hash, email_masked, email_ciphertext, availability_window_minutes, state, created_at, expires_at) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
      )
      .bind(
        request.id,
        request.user_id,
        request.language,
        request.region,
        request.timezone,
        request.email_hash,
        request.email_masked,
        request.email_ciphertext,
        request.availability_window_minutes,
        request.state,
        request.created_at,
        request.expires_at
      )
      .run();
    return request;
  }

  async getSeekerRequest(id: string): Promise<SeekerRequestRecord | null> {
    return this.db.prepare("SELECT * FROM seeker_requests WHERE id = ?1").bind(id).first<SeekerRequestRecord>();
  }

  async findActiveSeekerByUser(userId: string): Promise<SeekerRequestRecord | null> {
    return this.db
      .prepare("SELECT * FROM seeker_requests WHERE user_id = ?1 AND state IN ('pending', 'reserved', 'matched') LIMIT 1")
      .bind(userId)
      .first<SeekerRequestRecord>();
  }

  async findActiveSeekerByEmailHash(emailHash: string): Promise<SeekerRequestRecord | null> {
    return this.db
      .prepare("SELECT * FROM seeker_requests WHERE email_hash = ?1 AND state IN ('pending', 'reserved', 'matched') LIMIT 1")
      .bind(emailHash)
      .first<SeekerRequestRecord>();
  }

  async findRecentSeekerByEmailHash(emailHash: string, cutoffIso: string): Promise<SeekerRequestRecord | null> {
    return this.db
      .prepare("SELECT * FROM seeker_requests WHERE email_hash = ?1 AND created_at >= ?2 ORDER BY created_at DESC LIMIT 1")
      .bind(emailHash, cutoffIso)
      .first<SeekerRequestRecord>();
  }

  async listUserSeekerRequests(userId: string): Promise<SeekerRequestRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM seeker_requests WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 20")
      .bind(userId)
      .all<SeekerRequestRecord>();
    return result.results;
  }

  async listPendingSeekerRequests(): Promise<SeekerRequestRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM seeker_requests WHERE state = 'pending' ORDER BY created_at ASC LIMIT 50")
      .all<SeekerRequestRecord>();
    return result.results;
  }

  async countAuditEvents(actorUserId: string, eventType: string, sinceIso: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE actor_user_id = ?1 AND event_type = ?2 AND created_at >= ?3")
      .bind(actorUserId, eventType, sinceIso)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async createMatchReservation(input: {
    offer: GiverOfferRecord;
    seekerRequest: SeekerRequestRecord;
    reservedUntil: string;
    nowIso: string;
  }): Promise<MatchRecord> {
    const match: MatchRecord = {
      id: crypto.randomUUID(),
      giver_offer_id: input.offer.id,
      seeker_request_id: input.seekerRequest.id,
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

    const nextCapacity = Math.max(0, input.offer.capacity_active - 1);
    const nextOfferState = nextCapacity === 0 ? "exhausted" : "active";
    await this.db
      .prepare("UPDATE giver_offers SET capacity_active = ?1, state = ?2 WHERE id = ?3 AND capacity_active > 0")
      .bind(nextCapacity, nextOfferState, input.offer.id)
      .run();
    await this.db
      .prepare("UPDATE seeker_requests SET state = 'matched' WHERE id = ?1")
      .bind(input.seekerRequest.id)
      .run();
    await this.db
      .prepare(
        "INSERT INTO matches (id, giver_offer_id, seeker_request_id, state, reserved_until, invite_sent_at, seeker_received_at, seeker_completed_action_at, giver_confirmed_at, seeker_confirmed_at, closed_at, close_reason, created_at) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"
      )
      .bind(
        match.id,
        match.giver_offer_id,
        match.seeker_request_id,
        match.state,
        match.reserved_until,
        match.invite_sent_at,
        match.seeker_received_at,
        match.seeker_completed_action_at,
        match.giver_confirmed_at,
        match.seeker_confirmed_at,
        match.closed_at,
        match.close_reason,
        match.created_at
      )
      .run();
    return match;
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    return this.db.prepare("SELECT * FROM matches WHERE id = ?1").bind(id).first<MatchRecord>();
  }

  async updateMatch(match: MatchRecord): Promise<void> {
    await this.db
      .prepare(
        "UPDATE matches SET state = ?1, reserved_until = ?2, invite_sent_at = ?3, seeker_received_at = ?4, seeker_completed_action_at = ?5, giver_confirmed_at = ?6, seeker_confirmed_at = ?7, closed_at = ?8, close_reason = ?9 WHERE id = ?10"
      )
      .bind(
        match.state,
        match.reserved_until,
        match.invite_sent_at,
        match.seeker_received_at,
        match.seeker_completed_action_at,
        match.giver_confirmed_at,
        match.seeker_confirmed_at,
        match.closed_at,
        match.close_reason,
        match.id
      )
      .run();
  }

  async getMatchBundle(matchId: string): Promise<MatchBundle | null> {
    const match = await this.getMatch(matchId);
    if (!match) return null;
    const giverOffer = await this.db
      .prepare("SELECT * FROM giver_offers WHERE id = ?1")
      .bind(match.giver_offer_id)
      .first<GiverOfferRecord>();
    const seekerRequest = await this.db
      .prepare("SELECT * FROM seeker_requests WHERE id = ?1")
      .bind(match.seeker_request_id)
      .first<SeekerRequestRecord>();
    if (!giverOffer || !seekerRequest) return null;
    const giverUser = await this.getUserById(giverOffer.user_id);
    const seekerUser = await this.getUserById(seekerRequest.user_id);
    if (!giverUser || !seekerUser) return null;
    return { match, giverOffer, seekerRequest, giverUser, seekerUser };
  }

  async listOpenMatches(): Promise<MatchRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM matches WHERE state NOT IN ('completed', 'cancelled', 'expired', 'admin_resolved')")
      .all<MatchRecord>();
    return result.results;
  }

  async listStaleMatches(nowIso: string): Promise<MatchRecord[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM matches WHERE state NOT IN ('completed', 'cancelled', 'expired', 'admin_resolved') AND reserved_until < ?1"
      )
      .bind(nowIso)
      .all<MatchRecord>();
    return result.results;
  }

  async completeSeekerRequest(id: string): Promise<void> {
    await this.db.prepare("UPDATE seeker_requests SET state = 'completed', email_ciphertext = NULL WHERE id = ?1").bind(id).run();
  }

  async closeSeekerRequest(id: string, state: "cancelled" | "archived" | "blocked"): Promise<void> {
    await this.db.prepare("UPDATE seeker_requests SET state = ?1, email_ciphertext = NULL WHERE id = ?2").bind(state, id).run();
  }

  async clearSeekerEmailCiphertext(id: string): Promise<void> {
    await this.db.prepare("UPDATE seeker_requests SET email_ciphertext = NULL WHERE id = ?1").bind(id).run();
  }

  async clearExpiredEmailCiphertexts(cutoffIso: string): Promise<number> {
    const result = await this.db
      .prepare("UPDATE seeker_requests SET email_ciphertext = NULL WHERE email_ciphertext IS NOT NULL AND created_at < ?1")
      .bind(cutoffIso)
      .run();
    return result.meta?.changes ?? 0;
  }

  async restoreOfferCapacity(offerId: string): Promise<void> {
    const offer = await this.db.prepare("SELECT * FROM giver_offers WHERE id = ?1").bind(offerId).first<GiverOfferRecord>();
    if (!offer || offer.state === "cancelled" || offer.state === "archived") return;
    const nextCapacity = Math.min(offer.capacity_total, offer.capacity_active + 1);
    const nextState = nextCapacity > 0 ? "active" : offer.state;
    await this.db
      .prepare("UPDATE giver_offers SET capacity_active = ?1, state = ?2 WHERE id = ?3")
      .bind(nextCapacity, nextState, offerId)
      .run();
  }

  async addConfirmation(matchId: string, userId: string, kind: string, nowIso: string): Promise<void> {
    await this.db
      .prepare("INSERT OR IGNORE INTO confirmations (id, match_id, user_id, kind, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(crypto.randomUUID(), matchId, userId, kind, nowIso)
      .run();
  }

  async addAuditEvent(input: Omit<AuditEventRecord, "id">): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO audit_events (id, actor_user_id, entity_type, entity_id, event_type, reason_code, metadata_json, created_at) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
      )
      .bind(
        crypto.randomUUID(),
        input.actor_user_id,
        input.entity_type,
        input.entity_id,
        input.event_type,
        input.reason_code,
        input.metadata_json,
        input.created_at
      )
      .run();
  }

  async hasAuditEvent(entityType: string, entityId: string, eventType: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT id FROM audit_events WHERE entity_type = ?1 AND entity_id = ?2 AND event_type = ?3 LIMIT 1")
      .bind(entityType, entityId, eventType)
      .first<{ id: string }>();
    return Boolean(row);
  }

  async addAbuseFlag(input: Omit<AbuseFlagRecord, "id">): Promise<void> {
    await this.db
      .prepare("INSERT INTO abuse_flags (id, user_id, email_hash, reason_code, notes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(crypto.randomUUID(), input.user_id, input.email_hash, input.reason_code, input.notes, input.created_at)
      .run();
  }

  async getGiverReliabilityByOfferId(): Promise<Map<string, GiverReliabilityStats>> {
    const result = await this.db
      .prepare(
        "SELECT go.id AS offer_id, " +
          "SUM(CASE WHEN m.state = 'completed' THEN 1 ELSE 0 END) AS completed_matches, " +
          "SUM(CASE WHEN m.state = 'expired' THEN 1 ELSE 0 END) AS expired_reservations, " +
          "SUM(CASE WHEN m.close_reason = 'giver_no_show' THEN 1 ELSE 0 END) AS reported_no_shows " +
          "FROM giver_offers go LEFT JOIN giver_offers all_go ON all_go.user_id = go.user_id " +
          "LEFT JOIN matches m ON m.giver_offer_id = all_go.id GROUP BY go.id"
      )
      .all<{ offer_id: string; completed_matches: number | null; expired_reservations: number | null; reported_no_shows: number | null }>();
    const map = new Map<string, GiverReliabilityStats>();
    for (const row of result.results) {
      map.set(row.offer_id, {
        completed_matches: row.completed_matches ?? 0,
        expired_reservations: row.expired_reservations ?? 0,
        reported_no_shows: row.reported_no_shows ?? 0,
        cooldown_until: null
      });
    }
    return map;
  }

  async archiveActiveIntents(nowIso: string): Promise<number> {
    const offers = (
      await this.db
        .prepare("SELECT * FROM giver_offers WHERE state IN ('active', 'paused', 'reserved')")
        .all<GiverOfferRecord>()
    ).results;
    const seekers = (
      await this.db
        .prepare("SELECT * FROM seeker_requests WHERE state IN ('pending', 'reserved', 'matched')")
        .all<SeekerRequestRecord>()
    ).results;

    for (const offer of offers) {
      await this.archiveRecord("giver_offers", offer.id, offer, nowIso, "promo_archived");
      await this.db.prepare("UPDATE giver_offers SET state = 'archived' WHERE id = ?1").bind(offer.id).run();
    }
    for (const seeker of seekers) {
      await this.archiveRecord("seeker_requests", seeker.id, { ...seeker, email_ciphertext: null }, nowIso, "promo_archived");
      await this.db
        .prepare("UPDATE seeker_requests SET state = 'archived', email_ciphertext = NULL WHERE id = ?1")
        .bind(seeker.id)
        .run();
    }
    return offers.length + seekers.length;
  }

  async getAdminSnapshot(): Promise<AdminSnapshot> {
    const activeGiverOffers = (
      await this.db
        .prepare("SELECT * FROM giver_offers WHERE state IN ('active', 'paused', 'reserved', 'exhausted') ORDER BY created_at DESC LIMIT 100")
        .all<GiverOfferRecord>()
    ).results;
    const activeSeekerRequests = (
      await this.db
        .prepare("SELECT * FROM seeker_requests WHERE state IN ('pending', 'reserved', 'matched') ORDER BY created_at DESC LIMIT 100")
        .all<SeekerRequestRecord>()
    ).results;
    const matches = (
      await this.db.prepare("SELECT id FROM matches ORDER BY created_at DESC LIMIT 100").all<{ id: string }>()
    ).results;
    const bundles: MatchBundle[] = [];
    for (const match of matches) {
      const bundle = await this.getMatchBundle(match.id);
      if (bundle) bundles.push(bundle);
    }
    return {
      activeGiverOffers,
      activeSeekerRequests,
      matches: bundles,
      metrics: buildMetrics(bundles.map((bundle) => bundle.match))
    };
  }

  private async archiveRecord(
    sourceTable: string,
    sourceId: string,
    record: unknown,
    nowIso: string,
    reasonCode: string
  ): Promise<void> {
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO archived_records (id, source_table, source_id, record_json, archived_at, reason_code) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
      )
      .bind(crypto.randomUUID(), sourceTable, sourceId, JSON.stringify(record), nowIso, reasonCode)
      .run();
  }
}

export function buildMetrics(matches: MatchRecord[]): Record<string, number | null> {
  const completed = matches.filter((match) => match.state === "completed");
  return {
    matched_count: matches.length,
    completed_count: completed.length,
    expired_reservation_count: matches.filter((match) => match.state === "expired").length,
    giver_no_show_count: matches.filter((match) => match.close_reason === "giver_no_show").length,
    seeker_no_show_count: matches.filter((match) => match.close_reason === "seeker_no_show").length,
    median_time_to_match_minutes: median(matches.map((match) => durationMinutes(match.created_at, match.created_at)).filter(isNumber)),
    median_match_to_invite_sent_minutes: median(
      matches.map((match) => durationMinutes(match.created_at, match.invite_sent_at)).filter(isNumber)
    ),
    median_match_to_completion_minutes: median(
      completed.map((match) => durationMinutes(match.created_at, match.closed_at)).filter(isNumber)
    )
  };
}

export function outboxFromRows(rows: OutboxMessage[]): OutboxMessage[] {
  return rows;
}

function isNumber(value: number | null): value is number {
  return typeof value === "number";
}
