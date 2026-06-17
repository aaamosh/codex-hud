import { describe, expect, it } from "vitest";
import { BuddyService } from "../src/services";
import { makeUser, MemoryBuddyRepository } from "./helpers/memory-repo";

describe("codex-buddy integration flow", () => {
  it("runs give -> seek -> match -> relay -> confirm", async () => {
    const giver = makeUser("giver-user", "111111");
    const seeker = makeUser("seeker-user", "222222");
    const repo = new MemoryBuddyRepository([giver, seeker]);
    const service = new BuddyService(repo, {
      emailEncryptionKey: "test-secret",
      emailHashPepper: "test-pepper"
    });

    const offer = await service.createGiverOffer({
      user: giver,
      planType: "pro",
      language: "ru",
      region: "EU",
      timezone: "+02:00",
      capacityRequested: 2,
      now: new Date("2026-06-01T00:00:00.000Z")
    });
    expect(offer.ok).toBe(true);

    const request = await service.createSeekerRequest({
      user: seeker,
      language: "ru",
      region: "EU",
      timezone: "+03:00",
      email: "mira@example.com",
      availabilityWindowMinutes: 60,
      now: new Date("2026-06-01T00:01:00.000Z")
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error("request failed");

    const outbox = await service.attemptMatch(request.value.id, new Date("2026-06-01T00:02:00.000Z"));
    expect(outbox).toHaveLength(2);
    expect(outbox[0]?.text).toContain("mi***a@e***e.com");
    expect(outbox[0]?.text).not.toContain("mira@example.com");

    const match = repo.matches[0];
    expect(match?.state).toBe("reserved");

    const relay = await service.handleMatchAction({
      matchId: match!.id,
      action: "rel",
      actorUserId: giver.id,
      actorChatId: giver.telegram_user_id,
      now: new Date("2026-06-01T00:03:00.000Z")
    });
    expect(relay[0]?.text).toContain("mira@example.com");
    expect(relay[0]?.text).toContain("Download: https://github.com/aaamosh/codex-hud/raw/main/assets/codex-buddy-invite-helper.html");
    expect(relay[0]?.text).toContain("It does not send invites, call OpenAI endpoints, read cookies, or use tokens.");
    expect(relay[0]?.afterSend?.clearSeekerEmailCiphertextId).toBe(request.value.id);

    await repo.clearSeekerEmailCiphertext(request.value.id);
    expect(repo.seekers[0]?.email_ciphertext).toBeNull();

    await service.handleMatchAction({
      matchId: match!.id,
      action: "gs",
      actorUserId: giver.id,
      actorChatId: giver.telegram_user_id,
      now: new Date("2026-06-01T00:04:00.000Z")
    });
    await service.handleMatchAction({
      matchId: match!.id,
      action: "sr",
      actorUserId: seeker.id,
      actorChatId: seeker.telegram_user_id,
      now: new Date("2026-06-01T00:05:00.000Z")
    });
    const final = await service.handleMatchAction({
      matchId: match!.id,
      action: "sdone",
      actorUserId: seeker.id,
      actorChatId: seeker.telegram_user_id,
      now: new Date("2026-06-01T00:06:00.000Z")
    });

    expect(repo.matches[0]?.state).toBe("completed");
    expect(repo.seekers[0]?.state).toBe("completed");
    expect(final.map((message) => message.text).join("\n")).toContain("completed");
  });

  it("handles duplicate callbacks idempotently", async () => {
    const giver = makeUser("giver-user", "111111");
    const seeker = makeUser("seeker-user", "222222");
    const repo = new MemoryBuddyRepository([giver, seeker]);
    const service = new BuddyService(repo, {
      emailEncryptionKey: "test-secret",
      emailHashPepper: "test-pepper"
    });

    const offer = await service.createGiverOffer({
      user: giver,
      planType: "plus",
      language: "ru",
      region: "EU",
      timezone: "+02:00",
      capacityRequested: 1
    });
    expect(offer.ok).toBe(true);
    const request = await service.createSeekerRequest({
      user: seeker,
      language: "ru",
      region: "EU",
      timezone: "+02:00",
      email: "same@example.com",
      availabilityWindowMinutes: 30
    });
    if (!request.ok) throw new Error("request failed");
    await service.attemptMatch(request.value.id);

    const match = repo.matches[0]!;
    await service.handleMatchAction({ matchId: match.id, action: "gs", actorUserId: giver.id, actorChatId: giver.telegram_user_id });
    const duplicate = await service.handleMatchAction({ matchId: match.id, action: "gs", actorUserId: giver.id, actorChatId: giver.telegram_user_id });

    expect(duplicate[0]?.text).toContain("Already recorded");
    expect(repo.confirmations.filter((entry) => entry.kind === "giver_sent")).toHaveLength(1);
  });

  it("blocks active duplicate seeker email across Telegram users", async () => {
    const one = makeUser("user-1", "111111");
    const two = makeUser("user-2", "222222");
    const repo = new MemoryBuddyRepository([one, two]);
    const service = new BuddyService(repo, {
      emailEncryptionKey: "test-secret",
      emailHashPepper: "test-pepper"
    });

    const first = await service.createSeekerRequest({
      user: one,
      language: "ru",
      region: "EU",
      timezone: "+02:00",
      email: "dupe@example.com",
      availabilityWindowMinutes: 60
    });
    expect(first.ok).toBe(true);

    const second = await service.createSeekerRequest({
      user: two,
      language: "ru",
      region: "EU",
      timezone: "+02:00",
      email: "DUPE@example.com",
      availabilityWindowMinutes: 60
    });
    expect(second).toMatchObject({ ok: false, reason: "duplicate_email" });
    expect(repo.abuseFlags).toHaveLength(1);
  });

  it("can retry pending matching silently when no eligible giver exists", async () => {
    const solo = makeUser("solo-user", "111111");
    const repo = new MemoryBuddyRepository([solo]);
    const service = new BuddyService(repo, {
      emailEncryptionKey: "test-secret",
      emailHashPepper: "test-pepper"
    });

    const request = await service.createSeekerRequest({
      user: solo,
      language: "en",
      region: "global",
      timezone: "any",
      email: "solo@example.com",
      availabilityWindowMinutes: 60
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error("request failed");

    const initial = await service.attemptMatch(request.value.id);
    expect(initial).toHaveLength(1);
    expect(initial[0]?.text).toContain("No eligible giver is available yet");

    const quiet = await service.attemptMatch(request.value.id, new Date(), { notifyNoMatch: false });
    expect(quiet).toHaveLength(0);

    const offer = await service.createGiverOffer({
      user: solo,
      planType: "pro",
      language: "en",
      region: "global",
      timezone: "any",
      capacityRequested: 1
    });
    expect(offer.ok).toBe(true);

    const quietSelfReferral = await service.attemptMatch(request.value.id, new Date(), { notifyNoMatch: false });
    expect(quietSelfReferral).toHaveLength(0);

    const explicitSelfReferral = await service.attemptMatch(request.value.id);
    expect(explicitSelfReferral[0]?.text).toContain("self-referrals are not allowed");
  });

  it("archives active intents after promo end", async () => {
    const giver = makeUser("giver-user", "111111");
    const repo = new MemoryBuddyRepository([giver]);
    repo.configRows = [
      { key: "promo_end_at", value_json: JSON.stringify("2026-06-01T00:00:00.000Z") }
    ];
    const service = new BuddyService(repo, {
      emailEncryptionKey: "test-secret",
      emailHashPepper: "test-pepper"
    });

    repo.offers.push({
      id: "offer-1",
      user_id: giver.id,
      plan_type: "plus",
      language: "ru",
      region: "EU",
      timezone: "+02:00",
      capacity_total: 1,
      capacity_active: 1,
      state: "active",
      created_at: "2026-06-01T00:00:00.000Z",
      expires_at: null
    });

    const count = await service.archiveIfNeeded(new Date("2026-06-02T00:00:00.000Z"));
    expect(count).toBe(1);
    expect(repo.offers[0]?.state).toBe("archived");

    const blocked = await service.createGiverOffer({
      user: giver,
      planType: "plus",
      language: "ru",
      region: "EU",
      timezone: "+02:00",
      capacityRequested: 1,
      now: new Date("2026-06-02T00:01:00.000Z")
    });
    expect(blocked).toMatchObject({ ok: false, reason: "archive_mode" });
  });
});
