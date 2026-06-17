import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBuddyServerApp } from "../src/app";
import { openServerDatabase } from "../src/db";
import type { ServerEnv } from "../src/env";
import { BuddyNodeRuntime } from "../src/runtime";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function testEnv(dbPath: string): ServerEnv {
  return {
    BUDDY_DB_PATH: dbPath,
    BUDDY_HOST: "127.0.0.1",
    BUDDY_PORT: 8788,
    BUDDY_PUBLIC_BASE_URL: "https://127.0.0.1:8443",
    TELEGRAM_BOT_TOKEN: "0000000000:test",
    TELEGRAM_SECRET_TOKEN: "secret",
    ADMIN_TOKEN: "test-admin-token-long-enough",
    ADMIN_TELEGRAM_IDS: "100",
    EMAIL_ENCRYPTION_KEY: "test-encryption-secret",
    EMAIL_HASH_PEPPER: "test-hash-pepper"
  };
}

describe("buddy-server runtime", () => {
  it("uses minimal Telegram intake defaults for giver and seeker", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-buddy-server-"));
    tempDirs.push(dir);
    const env = testEnv(join(dir, "buddy.sqlite"));
    const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
    const runtime = new BuddyNodeRuntime(env, repo);
    const app = createBuddyServerApp(env, repo, runtime);
    const sentMessages: Array<{ chat_id: string; text: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { chat_id?: string; text?: string };
        if (body.chat_id && body.text) sentMessages.push({ chat_id: String(body.chat_id), text: body.text });
        return Response.json({ ok: true, result: true });
      })
    );

    await postTelegram(app, env, 1, { id: 100, username: "giver" }, "/give");
    expect(sentMessages.at(-1)?.text).toContain("How many active invite slots");
    await postTelegram(app, env, 2, { id: 100, username: "giver" }, "2");

    const offers = await repo.listActiveGiverOffers();
    expect(offers).toMatchObject([
      {
        plan_type: "pro",
        language: "en",
        region: "global",
        timezone: "any",
        capacity_total: 2,
        capacity_active: 2
      }
    ]);
    expect(sentMessages.at(-1)?.text).toContain("Offer active: slots 2/2");

    await postTelegram(app, env, 3, { id: 200, username: "seeker" }, "/seek");
    expect(sentMessages.at(-1)?.text).toContain("Send the email");
    await postTelegram(app, env, 4, { id: 200, username: "seeker" }, "seek@example.com");
    expect(sentMessages.at(-1)?.text).toContain("Can you act quickly");
    await postTelegramCallback(app, env, 5, { id: 200, username: "seeker" }, "s|seek_availability|60");

    const snapshot = await repo.getAdminSnapshot();
    expect(snapshot.activeSeekerRequests).toMatchObject([
      {
        state: "matched",
        language: "en",
        region: "global",
        timezone: "any",
        email_masked: "se***k@e***e.com"
      }
    ]);
    expect(snapshot.matches).toHaveLength(1);
    db.close();
  });

  it("replaces open giver offers and keeps status/cancel idempotent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-buddy-server-"));
    tempDirs.push(dir);
    const env = testEnv(join(dir, "buddy.sqlite"));
    const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
    const runtime = new BuddyNodeRuntime(env, repo);
    const app = createBuddyServerApp(env, repo, runtime);
    const sentMessages: Array<{ chat_id: string; text: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { chat_id?: string; text?: string };
        if (body.chat_id && body.text) sentMessages.push({ chat_id: String(body.chat_id), text: body.text });
        return Response.json({ ok: true, result: true });
      })
    );

    await postTelegram(app, env, 1, { id: 100, username: "giver" }, "/give");
    await postTelegram(app, env, 2, { id: 100, username: "giver" }, "3");
    await postTelegram(app, env, 3, { id: 100, username: "giver" }, "/give");
    await postTelegram(app, env, 4, { id: 100, username: "giver" }, "2");
    await postTelegram(app, env, 5, { id: 100, username: "giver" }, "/status");

    expect(sentMessages.at(-1)?.text).toBe("giver: active, slots 2/2");
    const user = await repo.upsertTelegramUser({ telegram_user_id: "100", username: "giver", first_name: "giver", locale: "ru" }, new Date().toISOString());
    const userOffers = await repo.listUserGiverOffers(user.id);
    expect(userOffers.filter((offer) => offer.state === "active")).toHaveLength(1);
    expect(userOffers.filter((offer) => offer.state === "cancelled")).toHaveLength(1);

    await postTelegram(app, env, 6, { id: 100, username: "giver" }, "/cancel");
    expect(sentMessages.at(-1)?.text).toBe("Active requests and offers were cancelled.");
    await postTelegram(app, env, 7, { id: 100, username: "giver" }, "/status");
    expect(sentMessages.at(-1)?.text).toBe("No active records yet.");
    await postTelegram(app, env, 8, { id: 100, username: "giver" }, "/cancel");
    expect(sentMessages.at(-1)?.text).toBe("There were no active requests or offers.");
    db.close();
  });

  it("explains that a user cannot match their own seeker request", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-buddy-server-"));
    tempDirs.push(dir);
    const env = testEnv(join(dir, "buddy.sqlite"));
    const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
    const runtime = new BuddyNodeRuntime(env, repo);
    const app = createBuddyServerApp(env, repo, runtime);
    const sentMessages: Array<{ chat_id: string; text: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { chat_id?: string; text?: string };
        if (body.chat_id && body.text) sentMessages.push({ chat_id: String(body.chat_id), text: body.text });
        return Response.json({ ok: true, result: true });
      })
    );

    await postTelegram(app, env, 1, { id: 100, username: "solo" }, "/seek");
    await postTelegram(app, env, 2, { id: 100, username: "solo" }, "solo@example.com");
    await postTelegramCallback(app, env, 3, { id: 100, username: "solo" }, "s|seek_availability|60");
    expect(sentMessages.at(-1)?.text).toContain("No eligible giver is available yet");

    await postTelegram(app, env, 4, { id: 100, username: "solo" }, "/give");
    await postTelegram(app, env, 5, { id: 100, username: "solo" }, "3");
    await postTelegram(app, env, 6, { id: 100, username: "solo" }, "/status");

    expect(sentMessages.at(-1)?.text).toContain("seeker: pending");
    expect(sentMessages.at(-1)?.text).toContain("Self-referrals are blocked");
    db.close();
  });

  it("wakes pending seekers immediately when a new giver offer appears", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-buddy-server-"));
    tempDirs.push(dir);
    const env = testEnv(join(dir, "buddy.sqlite"));
    const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
    const runtime = new BuddyNodeRuntime(env, repo);
    const app = createBuddyServerApp(env, repo, runtime);
    const sentMessages: Array<{ chat_id: string; text: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { chat_id?: string; text?: string };
        if (body.chat_id && body.text) sentMessages.push({ chat_id: String(body.chat_id), text: body.text });
        return Response.json({ ok: true, result: true });
      })
    );

    await postTelegram(app, env, 1, { id: 200, username: "seeker" }, "/seek");
    await postTelegram(app, env, 2, { id: 200, username: "seeker" }, "seek@example.com");
    await postTelegramCallback(app, env, 3, { id: 200, username: "seeker" }, "s|seek_availability|60");
    expect(sentMessages.at(-1)?.text).toContain("No eligible giver is available yet");

    await postTelegram(app, env, 4, { id: 100, username: "giver" }, "/give");
    await postTelegram(app, env, 5, { id: 100, username: "giver" }, "1");

    expect(sentMessages.some((message) => message.chat_id === "100" && message.text.includes("New match"))).toBe(true);
    expect(
      sentMessages.some(
        (message) =>
          message.chat_id === "100" &&
          message.text.includes("The bot does not send OpenAI invite emails automatically")
      )
    ).toBe(true);
    expect(
      sentMessages.some(
        (message) =>
          message.chat_id === "200" &&
          message.text.includes("A giver was found") &&
          message.text.includes("No OpenAI invite email has been sent by the bot")
      )
    ).toBe(true);
    expect((await repo.getAdminSnapshot()).matches).toHaveLength(1);
    db.close();
  });

  it("clears encrypted seeker email when a reserved match is cancelled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-buddy-server-"));
    tempDirs.push(dir);
    const env = testEnv(join(dir, "buddy.sqlite"));
    const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
    const runtime = new BuddyNodeRuntime(env, repo);

    const giver = await repo.upsertTelegramUser(
      { telegram_user_id: "100", username: "giver", first_name: "Giver", locale: "en" },
      "2026-06-17T00:00:00.000Z"
    );
    const seeker = await repo.upsertTelegramUser(
      { telegram_user_id: "200", username: "seeker", first_name: "Seeker", locale: "en" },
      "2026-06-17T00:00:01.000Z"
    );

    await runtime.service.createGiverOffer({
      user: giver,
      planType: "pro",
      language: "en",
      region: "global",
      timezone: "any",
      capacityRequested: 1
    });
    const request = await runtime.service.createSeekerRequest({
      user: seeker,
      language: "en",
      region: "global",
      timezone: "any",
      email: "cancel@example.com",
      availabilityWindowMinutes: 60
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error("request failed");
    expect((await repo.getSeekerRequest(request.value.id))?.email_ciphertext).toBeTruthy();

    await runtime.attemptMatch(request.value.id);
    const matchId = (await repo.getAdminSnapshot()).matches[0]?.match.id;
    expect(matchId).toBeTruthy();
    if (!matchId) throw new Error("missing match");

    await runtime.matchAction({ matchId, action: "gcannot", actorUserId: giver.id, actorChatId: giver.telegram_user_id });

    const closedRequest = await repo.getSeekerRequest(request.value.id);
    expect(closedRequest?.state).toBe("cancelled");
    expect(closedRequest?.email_ciphertext).toBeNull();
    db.close();
  });

  it("runs the basic give -> seek -> match -> confirm flow on SQLite", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-buddy-server-"));
    tempDirs.push(dir);
    const env = testEnv(join(dir, "buddy.sqlite"));
    const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
    const runtime = new BuddyNodeRuntime(env, repo);

    const giver = await repo.upsertTelegramUser(
      { telegram_user_id: "100", username: "giver", first_name: "Giver", locale: "ru" },
      "2026-06-17T00:00:00.000Z"
    );
    const seeker = await repo.upsertTelegramUser(
      { telegram_user_id: "200", username: "seeker", first_name: "Seeker", locale: "ru" },
      "2026-06-17T00:00:01.000Z"
    );

    const offer = await runtime.service.createGiverOffer({
      user: giver,
      planType: "pro",
      language: "ru",
      region: "RU",
      timezone: "+05:00",
      capacityRequested: 1,
      now: new Date("2026-06-17T00:00:02.000Z")
    });
    expect(offer.ok).toBe(true);

    const request = await runtime.service.createSeekerRequest({
      user: seeker,
      language: "ru",
      region: "RU",
      timezone: "+05:00",
      email: "seeker@example.com",
      availabilityWindowMinutes: 60,
      now: new Date("2026-06-17T00:00:03.000Z")
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error("request failed");

    const outbox = await runtime.attemptMatch(request.value.id);
    expect(outbox).toHaveLength(2);
    const matchId = (await repo.getAdminSnapshot()).matches[0]?.match.id;
    expect(matchId).toBeTruthy();
    if (!matchId) throw new Error("missing match");

    await runtime.matchAction({ matchId, action: "gs", actorUserId: giver.id, actorChatId: giver.telegram_user_id });
    await runtime.matchAction({ matchId, action: "sr", actorUserId: seeker.id, actorChatId: seeker.telegram_user_id });
    await runtime.matchAction({ matchId, action: "sdone", actorUserId: seeker.id, actorChatId: seeker.telegram_user_id });

    const bundle = await repo.getMatchBundle(matchId);
    expect(bundle?.match.state).toBe("completed");
    expect(bundle?.seekerRequest.state).toBe("completed");
    expect(bundle?.seekerRequest.email_ciphertext).toBeNull();
    db.close();
  });

  it("serves health and protects admin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-buddy-server-"));
    tempDirs.push(dir);
    const env = testEnv(join(dir, "buddy.sqlite"));
    const { db, repo } = openServerDatabase(env.BUDDY_DB_PATH, { migrate: true });
    const runtime = new BuddyNodeRuntime(env, repo);
    const app = createBuddyServerApp(env, repo, runtime);

    const health = await app.request("http://localhost/healthz");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, runtime: "server4-node" });

    expect((await app.request("http://localhost/admin")).status).toBe(401);
    expect((await app.request(`http://localhost/admin?token=${env.ADMIN_TOKEN}`)).status).toBe(200);
    expect((await app.request("http://localhost/invite-helper.html")).status).toBe(404);
    db.close();
  });
});

async function postTelegram(
  app: ReturnType<typeof createBuddyServerApp>,
  env: ServerEnv,
  updateId: number,
  from: { id: number; username: string },
  text: string
): Promise<Response> {
  return app.request("http://localhost/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_SECRET_TOKEN ?? "" },
    body: JSON.stringify({
      update_id: updateId,
      message: {
        message_id: updateId,
        from: { ...from, first_name: from.username, language_code: "ru" },
        chat: { id: from.id, type: "private" },
        text
      }
    })
  });
}

async function postTelegramCallback(
  app: ReturnType<typeof createBuddyServerApp>,
  env: ServerEnv,
  updateId: number,
  from: { id: number; username: string },
  data: string
): Promise<Response> {
  return app.request("http://localhost/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_SECRET_TOKEN ?? "" },
    body: JSON.stringify({
      update_id: updateId,
      callback_query: {
        id: `cb-${updateId}`,
        from: { ...from, first_name: from.username, language_code: "ru" },
        message: {
          message_id: updateId,
          from: { ...from, first_name: from.username, language_code: "ru" },
          chat: { id: from.id, type: "private" },
          text: ""
        },
        data
      }
    })
  });
}
