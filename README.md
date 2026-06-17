# codex-hud

`codex-hud` is a monorepo for small Codex-adjacent operator tools. The current MVP app is `codex-buddy`, a Telegram-based human-to-human matching layer around the official OpenAI Codex referral flow.

## Purpose

`codex-buddy` helps:

- Plus/Pro users with referral capacity offer help to real people.
- Not-yet-eligible Codex users find a real person who can invite them through the official OpenAI flow.
- Both sides close the loop after the invitee accepts and sends the first Codex message.

It is not an invite marketplace, not an automated referral sender, and does not call undocumented OpenAI invite mutation endpoints.

The current Telegram intake is intentionally minimal for a technical audience:

- givers enter only the number of active invite slots they want to offer
- seekers enter only the email needed for the official invite flow and confirm they can act quickly
- plan, language, country, and timezone are not asked in the bot; compatibility defaults are stored internally so old schema/config stays reusable

## Current Scope Status

Status: production-quality MVP scaffold with two deploy paths:

- current fast path: Server4-native Node/Hono + SQLite runtime in `apps/buddy-server`
- future promo path: Cloudflare Worker/Hono + D1 + Durable Object runtime in `apps/buddy-bot`

The Server4 path is intended for the current small-volume spike. The Cloudflare path is preserved for a later higher-volume promo campaign.

Server4 activation state:

- Telegram bot token and admin Telegram ID allowlist are installed in `/etc/codex-buddy/codex-buddy.env` on Server4.
- Telegram webhook is registered for `@codexHuddbot` at the operator-configured HTTPS endpoint with the Server4 self-signed certificate.
- Telegram command list, bot name, short description, and full description are configured in English for the default, `en`, and `ru` Telegram Bot API profile scopes.
- The deployed Server4 runtime is rechecked after behavior changes with systemd/nginx health, public and loopback health, cron, Telegram webhook info, Telegram bot profile setup, admin auth, and Server4 health monitor evidence.
- Admin HTML is `lang=en` and the live admin response has no Cyrillic characters.
- A real operator click-through of the simplified `/give` and `/seek` Telegram intake reached Server4. The resulting state has one active giver offer and one pending seeker request on the same Telegram user, so no match is created by design because self-referrals are blocked.
- Real Cloudflare D1 database IDs in `apps/buddy-bot/wrangler.toml` for the future Cloudflare path.

## Components

- `apps/buddy-server`: current Server4-native Node/Hono runtime, Telegram webhook, admin HTML/API, SQLite runtime, cron command.
- `apps/buddy-bot`: future Cloudflare Worker, Hono routes, Telegram webhook, Matchmaker Durable Object, admin HTML/API, cron handler.
- `packages/buddy`: shared business service for giver/seeker intake, matching, confirmations, cleanup, archive.
- `packages/core`: enums, state machine, matching, privacy, anti-abuse, archive, metrics.
- `packages/telegram`: Telegram API wrapper, callback parser, English bot copy, and inline keyboards.
- `assets`: transparent downloadable helper assets, including the GitHub-only invite helper HTML.
- `packages/db`: D1 repository and migrations.
- `packages/db-sqlite`: D1-compatible SQLite adapter for Server4.
- `packages/config`: remote-config defaults and validation.
- `docs`: deployment checklist, operator runbook, admin docs, privacy notes, migration notes.
- `fixtures/telegram`: sample Telegram update payloads.
- `scripts/seed-local-config.ts`: seeds D1 config rows from `config.sample.json`.

## Architecture

Telegram sends HTTPS webhook updates to `/telegram/webhook`. Both runtimes validate the optional Telegram secret token, store only a SHA-256 payload hash by `update_id`, and process commands or callbacks idempotently. Creating a giver offer immediately attempts to match currently pending seekers; cron remains the backup retry path.

In the Cloudflare runtime, critical match decisions go through one `MatchmakerDurableObject` instance named `codex-buddy-global-matchmaker`. The Durable Object serializes:

- pending seeker to active giver reservation
- one-time email relay callback
- giver/seeker confirmation actions
- reservation expiry
- ciphertext cleanup and archive actions

D1 is the source of persistent truth. Durable Object state is not the canonical data store.

In the Server4 runtime, the same shared service runs in a single Node process with a process-local serial queue for match-critical actions. SQLite is the source of persistent truth. The deployed service is expected to run as one systemd instance; do not scale it horizontally without replacing the queue with a database-backed lock.

## Data Model

The shared SQL migration creates:

- `users`
- `giver_offers`
- `seeker_requests`
- `matches`
- `confirmations`
- `abuse_flags`
- `audit_events`
- `config`
- `archived_records`
- `telegram_updates`
- `conversation_states`

`telegram_updates` and `conversation_states` are operational additions for webhook retry idempotency and multi-step Telegram intake.

The schema still contains `plan_type`, `language`, `region`, and `timezone` fields for compatibility and future promo waves. The current Telegram MVP writes neutral defaults and does not expose those fields in the bot intake.

## Privacy Model

- Seeker email is normalized and validated.
- Deduplication uses a keyed HMAC-SHA-256 hash with `EMAIL_HASH_PEPPER`.
- The admin UI shows only masked email.
- Full email is encrypted at rest with `EMAIL_ENCRYPTION_KEY` using AES-GCM.
- Giver initially sees only masked email and must press `Show email` for one-time relay.
- After successful Telegram delivery of the relay message, the runtime clears `email_ciphertext`.
- Closing or completing a seeker request also clears `email_ciphertext`.
- Cron also clears old ciphertext after `plaintext_relay_ttl_minutes`.
- Full email is never intentionally written to logs or audit metadata.

## Run, Deploy, Operate Entry Points

Install:

```bash
npm install
```

Typecheck:

```bash
npm run typecheck
```

Tests:

```bash
npm test
```

Local D1 migration:

```bash
npm run migrate:local
```

Seed local config:

```bash
npm run seed:local
```

Local Worker:

```bash
npm run dev
```

Local Server4-style runtime:

```bash
npm run dev:server
```

Server4 SQLite migration:

```bash
npm run server:migrate
```

Server4 seed:

```bash
npm run server:seed
```

Deploy:

```bash
npm run deploy
```

For the current Server4 path, see `docs/server4-deployment.md`. For the future Cloudflare path, replace `database_id` in `apps/buddy-bot/wrangler.toml` with the real D1 database ID and set Worker secrets from `.env.example`.

## Required Secrets

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET_TOKEN`
- `ADMIN_TOKEN`
- `ADMIN_TELEGRAM_IDS`
- `EMAIL_ENCRYPTION_KEY`
- `EMAIL_HASH_PEPPER`

Use Wrangler secrets:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_SECRET_TOKEN
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ADMIN_TELEGRAM_IDS
npx wrangler secret put EMAIL_ENCRYPTION_KEY
npx wrangler secret put EMAIL_HASH_PEPPER
```

Server4 also needs:

- `BUDDY_DB_PATH`
- `BUDDY_HOST`
- `BUDDY_PORT`
- `BUDDY_PUBLIC_BASE_URL`
- `TELEGRAM_WEBHOOK_CERT_PATH` when using a Telegram self-signed webhook certificate

Store Server4 values in `/etc/codex-buddy/codex-buddy.env`, not in git.

## Telegram Webhook

Cloudflare after deploy:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://<worker-host>/telegram/webhook","secret_token":"<TELEGRAM_SECRET_TOKEN>"}'
```

The bot uses webhook delivery only, not polling.

Server4 webhook registration:

```bash
set -a
. /etc/codex-buddy/codex-buddy.env
set +a
npm run server:set-webhook
npm run server:set-telegram-profile
```

For the no-domain MVP path, Server4 uses nginx TLS on `8443/tcp` and uploads `/etc/codex-buddy/webhook-cert.pem` to Telegram.

## Admin Surface

Open:

```text
https://<public-bot-host>/admin?token=<ADMIN_TOKEN>
```

The admin surface supports:

- active giver offers
- active seeker requests
- match list
- manual cancel/resolve
- user block
- promo/config edits
- JSON/CSV export
- aggregate metrics

## Invite Helper Asset

`assets/codex-buddy-invite-helper.html` is a transparent, single-file helper for givers who cannot easily access the official Codex referral UI from their current machine.

- Download: `https://github.com/aaamosh/codex-hud/raw/main/assets/codex-buddy-invite-helper.html`
- Source: `https://github.com/aaamosh/codex-hud/blob/main/assets/codex-buddy-invite-helper.html`
- It is not hosted on Server4 and the Telegram bot links only to GitHub.
- It has no external dependencies, no network calls, no cookies/tokens access, and no OpenAI invite endpoint calls.

See `docs/admin.md`.

## Cron

Server4 uses `codex-buddy-cron.timer` to run:

```bash
npm run server:cron
```

The future Cloudflare path is configured in `apps/buddy-bot/wrangler.toml`:

- `*/10 * * * *`
- `0 * * * *`

The scheduled handler:

- silently retries pending seeker matching; no-match status text is sent only during explicit user actions
- expires stale reservations
- clears old ciphertext
- archives active intents after promo end/archive mode
- sends one-time reminder nudges for open matches

Cloudflare cron propagation can lag after deploy; do not assume schedule changes apply instantly.

## Source Of Truth Map

- Product and runtime source of truth: this `README.md`.
- DB schema: `packages/db/migrations/0001_initial.sql`.
- Server4 deployment: `docs/server4-deployment.md`.
- Admin UI visual contract: `DESIGN.md`.
- Deferred repairs: `REPAIR_QUEUE.md`.
- Local repeatable lessons: `BEST_PRACTICES.md`.
- Operator docs: `docs/operator-runbook.md`.
- Deployment checklist: `docs/deployment-checklist.md`.
- Privacy/data retention: `docs/privacy-retention.md`.

## Repository Hygiene

The public repository is intentionally kept as a single-current-state history
for this MVP. The current checkout and reachable Git history must not contain
Cyrillic characters outside third-party dependency installs such as
`node_modules`, real Server4 host/IP values, Telegram bot tokens, admin IDs, or
runtime secrets.

Use these checks before publishing:

```bash
git grep -n -I -P '\p{Cyrillic}' -- .
PUBLIC_BOT_HOST='<actual-public-host-or-ip>' git grep -n -I -e "$PUBLIC_BOT_HOST" -- .
git grep -n -I -P '[0-9]{9,10}:[A-Za-z0-9_-]{30,}' -- .
find . \( -path '*/.git/*' -o -path '*/node_modules/*' \) -prune -o -type f -print0 | xargs -0 rg -n '\p{Cyrillic}' --no-heading
```

## Browser Verification Path

Admin UI is browser-facing. Deterministic harness for the Cloudflare app:

```bash
npm run playwright:test
```

If the exact Playwright-managed browser revision is not installed on this workstation, use an existing local Chromium:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/amosh/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run playwright:test
```

Projects final acceptance should use the canonical isolated browser path for the intended URL when technically possible:

```bash
agent-isolated-browser --session codex-buddy-admin start --replace --notify-user --url http://localhost:8787/admin?token=<ADMIN_TOKEN>
```

For Server4 acceptance, use the operator-configured Server4 admin URL:

```bash
agent-isolated-browser --session codex-buddy-server4-admin start --replace --notify-user --url https://<public-bot-host>/admin?token=<ADMIN_TOKEN>
```

## App Runtime Verification Path

No native desktop/mobile app runtime exists in this MVP. The only user-facing runtime surfaces are Telegram chat and the browser admin surface.

## Doc Update Contract

Meaningful changes to behavior, architecture, config, privacy, deployment, data format, admin workflow, Telegram UX, matching, cron/timer, Server4 runtime, Cloudflare runtime, or verification must update this README or the nearest docs in the same logical slice.
