import { transitionMatch } from "@codex-hud/core";
import { DEFAULT_CONFIG, parseRuntimeConfig } from "@codex-hud/config";
import type { D1BuddyRepository } from "@codex-hud/db";
import { Hono } from "hono";

export function createAdminRoutes(repo: D1BuddyRepository, adminToken: string): Hono {
  const adminRoutes = new Hono();

  adminRoutes.use("*", async (c, next) => {
    if (!isAuthorized(c.req.raw, adminToken)) return c.text("Unauthorized", 401);
    await next();
  });

  adminRoutes.get("/", async (c) => {
    const snapshot = await repo.getAdminSnapshot();
    const configRows = await repo.getConfigRows();
    const config = configRows.length > 0
      ? parseRuntimeConfig(Object.fromEntries(configRows.map((row) => [row.key, JSON.parse(row.value_json)])))
      : DEFAULT_CONFIG;
    const token = new URL(c.req.url).searchParams.get("token") ?? "";
    return c.html(renderAdmin(snapshot, config, token));
  });

  adminRoutes.get("/api/snapshot", async (c) => c.json(await repo.getAdminSnapshot()));

  adminRoutes.post("/api/config", async (c) => {
    const body = (await c.req.json()) as { key: string; value: unknown };
    await repo.setConfigValue(body.key, body.value, new Date().toISOString());
    return c.json({ ok: true });
  });

  adminRoutes.post("/api/users/:id/block", async (c) => {
    await repo.blockUser(c.req.param("id"), new Date().toISOString());
    return c.json({ ok: true });
  });

  adminRoutes.post("/api/users/:id/unblock", async (c) => {
    await repo.blockUser(c.req.param("id"), null);
    return c.json({ ok: true });
  });

  adminRoutes.post("/api/matches/:id/cancel", async (c) => {
    const bundle = await repo.getMatchBundle(c.req.param("id"));
    if (!bundle) return c.json({ ok: false, error: "not_found" }, 404);
    const transitioned = transitionMatch(bundle.match, {
      action: "cancel",
      nowIso: new Date().toISOString(),
      reason: "admin_cancelled"
    });
    if (transitioned.changed) {
      await repo.updateMatch(transitioned.match);
      await repo.closeSeekerRequest(bundle.seekerRequest.id, "cancelled");
      if (!bundle.match.invite_sent_at) await repo.restoreOfferCapacity(bundle.giverOffer.id);
    }
    return c.json({ ok: true });
  });

  adminRoutes.post("/api/matches/:id/resolve", async (c) => {
    const bundle = await repo.getMatchBundle(c.req.param("id"));
    if (!bundle) return c.json({ ok: false, error: "not_found" }, 404);
    const transitioned = transitionMatch(bundle.match, {
      action: "admin_resolve",
      nowIso: new Date().toISOString(),
      reason: "admin_resolved"
    });
    if (transitioned.changed) await repo.updateMatch(transitioned.match);
    return c.json({ ok: true });
  });

  adminRoutes.get("/api/export", async (c) => {
    const snapshot = await repo.getAdminSnapshot();
    const format = c.req.query("format") ?? "json";
    if (format === "csv") {
      const rows = [
        ["match_id", "state", "giver_telegram_id", "seeker_telegram_id", "masked_email", "created_at", "closed_at", "close_reason"],
        ...snapshot.matches.map((bundle) => [
          bundle.match.id,
          bundle.match.state,
          bundle.giverUser.telegram_user_id,
          bundle.seekerUser.telegram_user_id,
          bundle.seekerRequest.email_masked,
          bundle.match.created_at,
          bundle.match.closed_at ?? "",
          bundle.match.close_reason ?? ""
        ])
      ];
      return c.text(rows.map((row) => row.map(csvCell).join(",")).join("\n"), 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=codex-buddy-report.csv"
      });
    }
    return c.json(snapshot);
  });

  return adminRoutes;
}

function isAuthorized(request: Request, adminToken: string): boolean {
  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const queryToken = url.searchParams.get("token");
  return Boolean(adminToken && (bearer === adminToken || queryToken === adminToken));
}

function renderAdmin(snapshot: Awaited<ReturnType<D1BuddyRepository["getAdminSnapshot"]>>, config: typeof DEFAULT_CONFIG, token: string): string {
  const metricRows = Object.entries(snapshot.metrics)
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${value ?? "n/a"}</td></tr>`)
    .join("");
  const offers = snapshot.activeGiverOffers
    .map(
      (offer) =>
        `<tr><td>${escapeHtml(offer.state)}</td><td>${offer.capacity_active}/${offer.capacity_total}</td><td><code>${offer.user_id}</code></td></tr>`
    )
    .join("");
  const seekers = snapshot.activeSeekerRequests
    .map(
      (request) =>
        `<tr><td>${escapeHtml(request.state)}</td><td>${escapeHtml(request.email_masked)}</td><td><code>${request.user_id}</code></td></tr>`
    )
    .join("");
  const matches = snapshot.matches
    .map(
      (bundle) =>
        `<tr><td><code>${bundle.match.id}</code></td><td>${escapeHtml(bundle.match.state)}</td><td>${escapeHtml(bundle.giverUser.telegram_user_id)}</td><td>${escapeHtml(bundle.seekerUser.telegram_user_id)}</td><td>${escapeHtml(bundle.seekerRequest.email_masked)}</td><td>${escapeHtml(bundle.match.close_reason ?? "")}</td><td class="actions"><button data-action="cancel" data-id="${bundle.match.id}">Cancel</button><button data-action="resolve" data-id="${bundle.match.id}">Resolve</button><button data-user="${bundle.seekerUser.id}" data-block="block">Block seeker</button></td></tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>codex-buddy admin</title>
  <style>
    :root { color-scheme: dark; --canvas: #0B0D10; --surface: #11161C; --raised: #171D24; --line: rgba(178, 196, 210, 0.18); --text: #F1F5F2; --muted: #9AA7B2; --accent: #7DD7BD; --danger: #F08C86; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--canvas); color: var(--text); font-family: Satoshi, Geist, IBM Plex Sans, Segoe UI Variable, sans-serif; letter-spacing: 0; }
    main { max-width: 1440px; margin: 0 auto; padding: 24px; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line); padding-bottom: 16px; }
    h1, h2 { margin: 0; font-weight: 700; }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; margin-top: 28px; margin-bottom: 12px; }
    .muted { color: var(--muted); }
    .grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 16px; align-items: start; }
    .grid > *, section { min-width: 0; }
    section { border-top: 1px solid var(--line); padding-top: 16px; }
    table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 600; }
    tr:last-child td, tr:last-child th { border-bottom: 0; }
    code { font-family: JetBrains Mono, IBM Plex Mono, ui-monospace, monospace; color: var(--accent); }
    input, textarea, button, a.button { min-height: 44px; max-width: 100%; border-radius: 8px; border: 1px solid var(--line); background: var(--raised); color: var(--text); padding: 10px 12px; font: inherit; }
    textarea { width: 100%; min-height: 190px; resize: vertical; font-family: JetBrains Mono, IBM Plex Mono, ui-monospace, monospace; }
    button, a.button { cursor: pointer; text-decoration: none; }
    button:hover, a.button:hover { border-color: var(--accent); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .actions button[data-action="cancel"], .actions button[data-block="block"] { border-color: color-mix(in srgb, var(--danger), transparent 40%); }
    .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 16px; overflow: hidden; }
    .stack { display: grid; gap: 10px; }
    @media (max-width: 900px) {
      main { padding: 16px; }
      header, .grid { display: grid; grid-template-columns: 1fr; }
      header { align-items: start; }
      header .actions { width: 100%; }
      label { display: grid; gap: 6px; }
      input, textarea { width: 100%; }
      table { display: block; width: 100%; max-width: 100%; overflow-x: auto; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>codex-buddy admin</h1>
        <div class="muted">Masked email only. No OpenAI invite automation.</div>
      </div>
      <div class="actions">
        <a class="button" href="/admin/api/export?format=json&token=${encodeURIComponent(token)}">JSON export</a>
        <a class="button" href="/admin/api/export?format=csv&token=${encodeURIComponent(token)}">CSV export</a>
      </div>
    </header>
    <div class="grid">
      <aside class="stack">
        <section><h2>Metrics</h2><table>${metricRows}</table></section>
        <section class="panel">
          <h2>Config</h2>
          <form id="config-form" class="stack">
            <label>promo_end_at <input name="promo_end_at" value="${escapeHtml(config.promo_end_at ?? "")}" placeholder="2026-06-30T23:59:00.000Z"></label>
            <label>archive_mode <input name="archive_mode" value="${String(config.archive_mode)}"></label>
            <label>max giver capacity JSON <textarea name="max_giver_capacity_by_plan">${escapeHtml(JSON.stringify(config.max_giver_capacity_by_plan, null, 2))}</textarea></label>
            <button>Save config</button>
          </form>
        </section>
      </aside>
      <div>
        <section><h2>Giver offers</h2><table><thead><tr><th>State</th><th>Slots</th><th>User</th></tr></thead><tbody>${offers}</tbody></table></section>
        <section><h2>Seeker requests</h2><table><thead><tr><th>State</th><th>Email</th><th>User</th></tr></thead><tbody>${seekers}</tbody></table></section>
        <section><h2>Matches</h2><table><thead><tr><th>ID</th><th>State</th><th>Giver TG</th><th>Seeker TG</th><th>Email</th><th>Reason</th><th>Actions</th></tr></thead><tbody>${matches}</tbody></table></section>
      </div>
    </div>
  </main>
  <script>
    const token = ${JSON.stringify(token)};
    const api = (path, options = {}) => fetch(path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token), {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) }
    }).then((response) => {
      if (!response.ok) throw new Error("Request failed " + response.status);
      return response.json();
    });
    document.querySelector("#config-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const promo = String(data.get("promo_end_at") || "").trim();
      await api("/admin/api/config", { method: "POST", body: JSON.stringify({ key: "promo_end_at", value: promo || null }) });
      await api("/admin/api/config", { method: "POST", body: JSON.stringify({ key: "archive_mode", value: String(data.get("archive_mode")).trim() === "true" }) });
      await api("/admin/api/config", { method: "POST", body: JSON.stringify({ key: "max_giver_capacity_by_plan", value: JSON.parse(String(data.get("max_giver_capacity_by_plan"))) }) });
      location.reload();
    });
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action], button[data-block]");
      if (!button) return;
      if (button.dataset.action) await api("/admin/api/matches/" + button.dataset.id + "/" + button.dataset.action, { method: "POST" });
      if (button.dataset.block) await api("/admin/api/users/" + button.dataset.user + "/" + button.dataset.block, { method: "POST" });
      location.reload();
    });
  </script>
</body>
</html>`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
