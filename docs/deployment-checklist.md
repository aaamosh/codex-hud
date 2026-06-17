# Deployment Checklist

## Current MVP: Server4

1. Pull repo on Server4 under `/opt/projects/codex-hud`.
2. Create `/etc/codex-buddy/codex-buddy.env` with real secrets.
3. Install dependencies:

```bash
npm ci
```

4. Install systemd/nginx files from `docs/deploy/`.
5. Generate or install the webhook TLS certificate.
6. Apply migration and seed config:

```bash
npm run server:migrate
npm run server:seed
```

When running those manually outside systemd on Server4, pass or export `BUDDY_DB_PATH=/var/lib/codex-buddy/codex-buddy.sqlite`.

7. Enable runtime:

```bash
systemctl daemon-reload
nginx -t
systemctl reload nginx
ufw allow 8443/tcp comment codex-buddy-telegram-webhook
systemctl enable --now codex-buddy.service codex-buddy-cron.timer
```

8. Register Telegram webhook:

```bash
set -a
. /etc/codex-buddy/codex-buddy.env
set +a
npm run server:set-webhook
npm run server:set-telegram-profile
```

9. Smoke check:

```bash
curl -fsS http://127.0.0.1:18788/healthz
curl -k -fsS https://<public-bot-host>/healthz
curl -k -H "Authorization: Bearer $ADMIN_TOKEN" https://<public-bot-host>/admin/api/snapshot
```

10. Verify actual Telegram `/start`.
11. Verify actual admin browser path.
12. Run `server4-health-monitor doctor --env-file /opt/server4-health-monitor/.env`.

Server4 live manual changes must go through `fleet-manual-ops-audit`.

## Future Promo: Cloudflare

1. Create D1 database:

```bash
npx wrangler d1 create codex_hud_buddy
```

2. Put the real `database_id` in `apps/buddy-bot/wrangler.toml`.
3. Set Worker secrets:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_SECRET_TOKEN
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ADMIN_TELEGRAM_IDS
npx wrangler secret put EMAIL_ENCRYPTION_KEY
npx wrangler secret put EMAIL_HASH_PEPPER
```

4. Apply migrations:

```bash
npm run migrate:remote
```

5. Seed config:

```bash
npm run seed:remote
```

6. Deploy Worker:

```bash
npm run deploy:cloudflare
```

7. Register Telegram webhook against the Worker URL.
8. Smoke `/healthz`, `/admin/api/snapshot`, admin browser path, and Telegram `/start`.
