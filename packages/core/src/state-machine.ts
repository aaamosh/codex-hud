import { TERMINAL_MATCH_STATES, type CancellationReason, type MatchRecord } from "./types";

export type MatchAction =
  | "giver_sent"
  | "seeker_received"
  | "seeker_completed"
  | "cancel"
  | "expire"
  | "admin_resolve";

export interface MatchTransitionInput {
  action: MatchAction;
  nowIso: string;
  reason?: CancellationReason | "admin_resolved";
}

export interface MatchTransitionResult {
  match: MatchRecord;
  changed: boolean;
  idempotent: boolean;
}

export function transitionMatch(match: MatchRecord, input: MatchTransitionInput): MatchTransitionResult {
  if (isTerminalMatchState(match.state)) {
    return { match, changed: false, idempotent: true };
  }

  switch (input.action) {
    case "giver_sent":
      if (match.invite_sent_at && match.giver_confirmed_at) {
        return { match, changed: false, idempotent: true };
      }
      return finishIfReady({
        ...match,
        invite_sent_at: match.invite_sent_at ?? input.nowIso,
        giver_confirmed_at: match.giver_confirmed_at ?? input.nowIso
      });
    case "seeker_received":
      if (match.seeker_received_at) {
        return { match, changed: false, idempotent: true };
      }
      return finishIfReady({
        ...match,
        seeker_received_at: input.nowIso
      });
    case "seeker_completed":
      if (match.seeker_completed_action_at && match.seeker_confirmed_at) {
        return { match, changed: false, idempotent: true };
      }
      return finishIfReady({
        ...match,
        seeker_completed_action_at: match.seeker_completed_action_at ?? input.nowIso,
        seeker_confirmed_at: match.seeker_confirmed_at ?? input.nowIso
      });
    case "cancel":
      return {
        match: {
          ...match,
          state: "cancelled",
          closed_at: input.nowIso,
          close_reason: input.reason ?? "user_cancelled"
        },
        changed: true,
        idempotent: false
      };
    case "expire":
      return {
        match: {
          ...match,
          state: "expired",
          closed_at: input.nowIso,
          close_reason: input.reason ?? "reservation_expired"
        },
        changed: true,
        idempotent: false
      };
    case "admin_resolve":
      return {
        match: {
          ...match,
          state: "admin_resolved",
          closed_at: input.nowIso,
          close_reason: input.reason ?? "admin_resolved"
        },
        changed: true,
        idempotent: false
      };
  }
}

function isTerminalMatchState(state: MatchRecord["state"]): boolean {
  return (TERMINAL_MATCH_STATES as readonly string[]).includes(state);
}

function finishIfReady(match: MatchRecord): MatchTransitionResult {
  const next = { ...match };
  if (next.giver_confirmed_at && next.seeker_completed_action_at && next.seeker_confirmed_at) {
    next.state = "completed";
    next.closed_at = next.closed_at ?? newest(next.giver_confirmed_at, next.seeker_confirmed_at);
    next.close_reason = "completed";
  } else if (next.seeker_completed_action_at || (next.invite_sent_at && next.seeker_received_at)) {
    next.state = "awaiting_final_confirmation";
  } else if (next.invite_sent_at) {
    next.state = "giver_sent";
  } else if (next.seeker_received_at) {
    next.state = "seeker_received";
  } else {
    next.state = "reserved";
  }
  return { match: next, changed: true, idempotent: false };
}

function newest(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}
