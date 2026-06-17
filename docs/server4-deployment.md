# Server4 Deployment

`apps/buddy-server` is the current minimal Server4-native runtime for `codex-buddy`.
The Cloudflare Worker in `apps/buddy-bot` is preserved as the future promo deploy path.

## Runtime Shape

- Node/Hono app: `@codex-hud/buddy-server`
- HTTP bind: `127.0.0.1:18788`
- Public webhook/admin ingress: Server4 nginx on `8443/tcp`
- nginx access log: `/var/log/nginx/access.log`, so the existing `nginx-overload` Fail2Ban jail sees this public surface
- Storage: SQLite at `/var/lib/codex-buddy/codex-buddy.sqlite`
- Config/secrets: `/etc/codex-buddy/codex-buddy.env`
- Service: `codex-buddy.service`
- Timer: `codex-buddy-cron.timer`

Telegram requires HTTPS webhook delivery. For the no-domain MVP path, Server4 can use a self-signed certificate on the operator-configured HTTPS endpoint and upload the public certificate through `npm run server:set-webhook`.

## Environment

Required env file keys:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_SECRET_TOKEN=...
ADMIN_TOKEN=...
ADMIN_TELEGRAM_IDS=...
EMAIL_ENCRYPTION_KEY=...
EMAIL_HASH_PEPPER=...
BUDDY_DB_PATH=/var/lib/codex-buddy/codex-buddy.sqlite
BUDDY_HOST=127.0.0.1
BUDDY_PORT=18788
BUDDY_PUBLIC_BASE_URL=https://<public-bot-host>
TELEGRAM_WEBHOOK_CERT_PATH=/etc/codex-buddy/webhook-cert.pem
```

Do not commit real values.

## One-Time Server Install

```bash
install -d -m 0750 /etc/codex-buddy /var/lib/codex-buddy
openssl req -newkey rsa:2048 -sha256 -nodes -keyout /etc/codex-buddy/webhook-key.pem \
  -x509 -days 365 -out /etc/codex-buddy/webhook-cert.pem \
  -subj "/CN=<public-bot-host>" \
  -addext "subjectAltName=DNS:<public-bot-host>"
chmod 0600 /etc/codex-buddy/webhook-key.pem
chmod 0644 /etc/codex-buddy/webhook-cert.pem
cp docs/deploy/server4-codex-buddy.service /etc/systemd/system/codex-buddy.service
cp docs/deploy/server4-codex-buddy-cron.service /etc/systemd/system/codex-buddy-cron.service
cp docs/deploy/server4-codex-buddy-cron.timer /etc/systemd/system/codex-buddy-cron.timer
cp docs/deploy/server4-nginx-codex-buddy.conf /etc/nginx/sites-available/codex-buddy.conf
ln -sf /etc/nginx/sites-available/codex-buddy.conf /etc/nginx/sites-enabled/codex-buddy.conf
npm ci
BUDDY_DB_PATH=/var/lib/codex-buddy/codex-buddy.sqlite npm run server:migrate
BUDDY_DB_PATH=/var/lib/codex-buddy/codex-buddy.sqlite npm run server:seed
systemctl daemon-reload
nginx -t
systemctl reload nginx
ufw allow 8443/tcp comment codex-buddy-telegram-webhook
systemctl enable --now codex-buddy.service codex-buddy-cron.timer
set -a
. /etc/codex-buddy/codex-buddy.env
set +a
npm run server:set-webhook
npm run server:set-telegram-profile
```

Live changes on Server4 must go through `fleet-manual-ops-audit`.

## Verification

```bash
curl -fsS http://127.0.0.1:18788/healthz
curl -k -fsS https://<public-bot-host>/healthz
systemctl status --no-pager codex-buddy.service codex-buddy-cron.timer nginx.service
journalctl -u codex-buddy.service -n 100 --no-pager
server4-health-monitor doctor --env-file /opt/server4-health-monitor/.env
```

Admin:

```text
https://<public-bot-host>/admin?token=<ADMIN_TOKEN>
```

Telegram:

- `/start`
- `/give`
- `/seek`
- match callback buttons

The bot never sends OpenAI invites automatically. Givers use the official OpenAI Codex app flow manually.
