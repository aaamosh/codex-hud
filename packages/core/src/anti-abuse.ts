import type { BuddyRuntimeConfig, SeekerRequestRecord } from "./types";

export const ACTIVE_SEEKER_STATES = ["pending", "reserved", "matched"] as const;

export interface SeekerAbuseCheckInput {
  existingActiveByUser: SeekerRequestRecord | null;
  existingActiveByEmail: SeekerRequestRecord | null;
  recentByEmailWithinCooldown: SeekerRequestRecord | null;
  recentCancelEventsInWindow: number;
  config: BuddyRuntimeConfig;
}

export type AbuseDecision =
  | { ok: true }
  | { ok: false; reason: "duplicate_user" | "duplicate_email" | "cooldown" | "cancel_spam"; message: string };

export function canCreateSeekerRequest(input: SeekerAbuseCheckInput): AbuseDecision {
  if (input.existingActiveByUser) {
    return {
      ok: false,
      reason: "duplicate_user",
      message: "You already have an active request. Check /status or use /cancel before creating a new one."
    };
  }
  if (input.existingActiveByEmail) {
    return {
      ok: false,
      reason: "duplicate_email",
      message: "This email already has an active or recent request. To avoid duplicates, a new request is blocked for now."
    };
  }
  if (input.recentByEmailWithinCooldown) {
    return {
      ok: false,
      reason: "cooldown",
      message: "This email was used in a recent request. Try again after the cooldown ends."
    };
  }
  if (input.recentCancelEventsInWindow >= input.config.max_cancel_events_per_window) {
    return {
      ok: false,
      reason: "cancel_spam",
      message: "Too many cancellations in a short time. Please pause and try again later."
    };
  }
  return { ok: true };
}

export function isActiveSeekerState(state: string): boolean {
  return ACTIVE_SEEKER_STATES.includes(state as (typeof ACTIVE_SEEKER_STATES)[number]);
}

export function clampGiverCapacity(planCap: number, requested: number): number {
  if (!Number.isFinite(requested)) return 1;
  return Math.max(1, Math.min(Math.trunc(requested), planCap));
}
