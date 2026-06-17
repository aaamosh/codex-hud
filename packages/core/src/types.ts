export const PLAN_TYPES = ["plus", "pro"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const GIVER_OFFER_STATES = [
  "active",
  "paused",
  "reserved",
  "exhausted",
  "cancelled",
  "archived"
] as const;
export type GiverOfferState = (typeof GIVER_OFFER_STATES)[number];

export const SEEKER_REQUEST_STATES = [
  "pending",
  "reserved",
  "matched",
  "completed",
  "cancelled",
  "archived",
  "blocked"
] as const;
export type SeekerRequestState = (typeof SEEKER_REQUEST_STATES)[number];

export const MATCH_STATES = [
  "reserved",
  "giver_sent",
  "seeker_received",
  "awaiting_final_confirmation",
  "completed",
  "cancelled",
  "expired",
  "admin_resolved"
] as const;
export type MatchState = (typeof MATCH_STATES)[number];

export const TERMINAL_MATCH_STATES = [
  "completed",
  "cancelled",
  "expired",
  "admin_resolved"
] as const satisfies readonly MatchState[];

export type CancellationReason =
  | "giver_cannot_send"
  | "seeker_did_not_receive"
  | "user_cancelled"
  | "reservation_expired"
  | "promo_archived"
  | "admin_cancelled"
  | "blocked"
  | "duplicate_email"
  | "duplicate_user"
  | "cooldown";

export interface UserRecord {
  id: string;
  telegram_user_id: string;
  username: string | null;
  first_name: string | null;
  role_summary: string | null;
  locale: string | null;
  created_at: string;
  blocked_at: string | null;
}

export interface GiverOfferRecord {
  id: string;
  user_id: string;
  plan_type: PlanType;
  language: string;
  region: string;
  timezone: string;
  capacity_total: number;
  capacity_active: number;
  state: GiverOfferState;
  created_at: string;
  expires_at: string | null;
}

export interface SeekerRequestRecord {
  id: string;
  user_id: string;
  language: string;
  region: string;
  timezone: string;
  email_hash: string;
  email_masked: string;
  email_ciphertext: string | null;
  availability_window_minutes: number;
  state: SeekerRequestState;
  created_at: string;
  expires_at: string | null;
}

export interface MatchRecord {
  id: string;
  giver_offer_id: string;
  seeker_request_id: string;
  state: MatchState;
  reserved_until: string;
  invite_sent_at: string | null;
  seeker_received_at: string | null;
  seeker_completed_action_at: string | null;
  giver_confirmed_at: string | null;
  seeker_confirmed_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
}

export interface ConfirmationRecord {
  id: string;
  match_id: string;
  user_id: string;
  kind: "giver_sent" | "seeker_received" | "seeker_completed" | "admin_resolved";
  created_at: string;
}

export interface AbuseFlagRecord {
  id: string;
  user_id: string | null;
  email_hash: string | null;
  reason_code: string;
  notes: string | null;
  created_at: string;
}

export interface AuditEventRecord {
  id: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  event_type: string;
  reason_code: string | null;
  metadata_json: string | null;
  created_at: string;
}

export interface BuddyRuntimeConfig {
  promo_end_at: string | null;
  archive_mode: boolean;
  archive_mode_message: string;
  max_giver_capacity_by_plan: Record<PlanType, number>;
  reservation_ttl_minutes: number;
  completion_timeout_minutes: number;
  plaintext_relay_ttl_minutes: number;
  seeker_email_cooldown_hours: number;
  cancel_spam_cooldown_minutes: number;
  max_cancel_events_per_window: number;
  allowed_regions: string[];
  language_priority: string[];
}

export interface GiverReliabilityStats {
  completed_matches: number;
  expired_reservations: number;
  reported_no_shows: number;
  cooldown_until: string | null;
}

export interface MatchBundle {
  match: MatchRecord;
  giverOffer: GiverOfferRecord;
  seekerRequest: SeekerRequestRecord;
  giverUser: UserRecord;
  seekerUser: UserRecord;
}

export interface OutboxMessage {
  chatId: string;
  text: string;
  replyMarkup?: unknown;
  afterSend?: {
    clearSeekerEmailCiphertextId?: string;
  };
}
