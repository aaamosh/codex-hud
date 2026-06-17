import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@codex-hud/config";
import { canCreateSeekerRequest, type SeekerRequestRecord } from "../src";

const request: SeekerRequestRecord = {
  id: "request",
  user_id: "user",
  language: "ru",
  region: "EU",
  timezone: "+02:00",
  email_hash: "hash",
  email_masked: "al***e@e***e.com",
  email_ciphertext: "v1:a:b",
  availability_window_minutes: 60,
  state: "pending",
  created_at: "2026-06-01T00:00:00.000Z",
  expires_at: null
};

describe("anti-abuse", () => {
  it("blocks duplicate active user and email requests", () => {
    expect(
      canCreateSeekerRequest({
        existingActiveByUser: request,
        existingActiveByEmail: null,
        recentByEmailWithinCooldown: null,
        recentCancelEventsInWindow: 0,
        config: DEFAULT_CONFIG
      })
    ).toMatchObject({ ok: false, reason: "duplicate_user" });

    expect(
      canCreateSeekerRequest({
        existingActiveByUser: null,
        existingActiveByEmail: request,
        recentByEmailWithinCooldown: null,
        recentCancelEventsInWindow: 0,
        config: DEFAULT_CONFIG
      })
    ).toMatchObject({ ok: false, reason: "duplicate_email" });
  });

  it("blocks cancel spam", () => {
    expect(
      canCreateSeekerRequest({
        existingActiveByUser: null,
        existingActiveByEmail: null,
        recentByEmailWithinCooldown: null,
        recentCancelEventsInWindow: DEFAULT_CONFIG.max_cancel_events_per_window,
        config: DEFAULT_CONFIG
      })
    ).toMatchObject({ ok: false, reason: "cancel_spam" });
  });
});
