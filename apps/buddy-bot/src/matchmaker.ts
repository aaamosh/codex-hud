import { D1BuddyRepository } from "@codex-hud/db";
import type { OutboxMessage } from "@codex-hud/core";
import type { Env } from "./env";
import { BuddyService, secretsFromEnv } from "./services";

export class MatchmakerDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const repo = new D1BuddyRepository(this.env.DB);
    const service = new BuddyService(repo, secretsFromEnv(this.env));

    if (request.method === "POST" && url.pathname === "/attempt-match") {
      const body = (await request.json()) as { seekerRequestId: string; notifyNoMatch?: boolean };
      return json(await this.state.blockConcurrencyWhile(() => service.attemptMatch(body.seekerRequestId, new Date(), { notifyNoMatch: body.notifyNoMatch })));
    }

    if (request.method === "POST" && url.pathname === "/attempt-pending") {
      return json(await this.state.blockConcurrencyWhile(() => service.attemptPendingMatches()));
    }

    if (request.method === "POST" && url.pathname === "/match-action") {
      const body = (await request.json()) as {
        matchId: string;
        action: "rel" | "gs" | "gcannot" | "sr" | "snr" | "sdone" | "cancel";
        actorUserId: string;
        actorChatId: string;
      };
      return json(await this.state.blockConcurrencyWhile(() => service.handleMatchAction(body)));
    }

    if (request.method === "POST" && url.pathname === "/expire") {
      const count = await this.state.blockConcurrencyWhile(() => service.expireStaleMatches());
      return json({ count });
    }

    if (request.method === "POST" && url.pathname === "/cleanup-email") {
      const count = await this.state.blockConcurrencyWhile(() => service.cleanupCiphertexts());
      return json({ count });
    }

    if (request.method === "POST" && url.pathname === "/archive") {
      const count = await this.state.blockConcurrencyWhile(() => service.archiveIfNeeded());
      return json({ count });
    }

    return new Response("Not found", { status: 404 });
  }
}

export async function callMatchmaker(env: Env, path: string, body: unknown): Promise<OutboxMessage[]> {
  const id = env.MATCHMAKER.idFromName("codex-buddy-global-matchmaker");
  const stub = env.MATCHMAKER.get(id);
  const response = await stub.fetch(`https://matchmaker.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Matchmaker ${path} failed: ${response.status}`);
  return (await response.json()) as OutboxMessage[];
}

export async function callMatchmakerCount(env: Env, path: string): Promise<number> {
  const id = env.MATCHMAKER.idFromName("codex-buddy-global-matchmaker");
  const stub = env.MATCHMAKER.get(id);
  const response = await stub.fetch(`https://matchmaker.local${path}`, { method: "POST" });
  if (!response.ok) throw new Error(`Matchmaker ${path} failed: ${response.status}`);
  const body = (await response.json()) as { count: number };
  return body.count;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
