import { describe, expect, it } from "vitest";
import { transitionMatch, type MatchRecord } from "../src";

const baseMatch: MatchRecord = {
  id: "match",
  giver_offer_id: "offer",
  seeker_request_id: "request",
  state: "reserved",
  reserved_until: "2026-06-01T01:00:00.000Z",
  invite_sent_at: null,
  seeker_received_at: null,
  seeker_completed_action_at: null,
  giver_confirmed_at: null,
  seeker_confirmed_at: null,
  closed_at: null,
  close_reason: null,
  created_at: "2026-06-01T00:00:00.000Z"
};

describe("match state machine", () => {
  it("requires giver and seeker final confirmation before completion", () => {
    const giver = transitionMatch(baseMatch, { action: "giver_sent", nowIso: "2026-06-01T00:05:00.000Z" }).match;
    expect(giver.state).toBe("giver_sent");

    const received = transitionMatch(giver, { action: "seeker_received", nowIso: "2026-06-01T00:10:00.000Z" }).match;
    expect(received.state).toBe("awaiting_final_confirmation");

    const completed = transitionMatch(received, { action: "seeker_completed", nowIso: "2026-06-01T00:15:00.000Z" }).match;
    expect(completed.state).toBe("completed");
    expect(completed.close_reason).toBe("completed");
  });

  it("is idempotent after duplicate callbacks", () => {
    const first = transitionMatch(baseMatch, { action: "giver_sent", nowIso: "2026-06-01T00:05:00.000Z" });
    const second = transitionMatch(first.match, { action: "giver_sent", nowIso: "2026-06-01T00:06:00.000Z" });
    expect(second.changed).toBe(false);
    expect(second.idempotent).toBe(true);
  });
});

