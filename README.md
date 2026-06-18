# codex-hud / codex-buddy

> **Codex referrals, coordinated.**
> A small Telegram bot that pairs people who have OpenAI Codex referral slots with people who don't yet have Codex access — so both sides get a banked rate-limit reset through the official OpenAI flow.

**→ Try it: [t.me/codexHuddbot](https://t.me/codexHuddbot)**

[![status](https://img.shields.io/badge/status-live-2ea44f)](https://t.me/codexHuddbot)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![promo window](https://img.shields.io/badge/OpenAI%20promo-through%202026--06--24-orange)](https://help.openai.com/en/articles/20001271-codex-referral-promotions)

---

## What this is

OpenAI is running a **time-bounded Codex referral promotion through 2026-06-24**. Plus/Pro subscribers get up to 3 invites; every time a new person accepts an invite and sends their first Codex message, **both sides earn one banked rate-limit reset** they can spend whenever they want.

The catch: if you don't already know someone outside the Codex bubble, you have no one to invite. And if you're not yet on Codex, you have no easy way to find someone with a free slot.

`codex-buddy` solves exactly that coordination problem.

### If you have invite slots to give

1. Start a chat with the bot, send `/give`, tell it how many slots you're offering.
2. When a real seeker shows up, the bot relays their email to you once. You manually send the official invite from your Codex app or extension.
3. After both sides confirm the loop closed, you both have a banked reset.

### If you want a Codex invite

1. Start a chat with the bot, send `/seek`, give it the email you'd like to receive the invite at.
2. The bot waits for a real giver to take your slot. You'll get a normal OpenAI invite by email — no funny business.
3. Accept it, send your first Codex message, hit `/confirmed` to close the loop. The giver does the same.

### What this isn't

- ❌ Not an invite marketplace, not a code reseller, **no money involved**.
- ❌ Not an automated referral sender — the giver manually uses OpenAI's official invite flow.
- ❌ Does **not** call any unofficial OpenAI mutation endpoints. Email is the only thing relayed.
- ❌ Not a way around OpenAI's ToS — both sides are real people doing the real flow.

### Privacy

Seeker email is encrypted at rest with AES-GCM, deduped by HMAC-SHA-256 (keyed with a private pepper, so the raw email never has to be stored to dedupe). Admin UI only ever shows a masked email. After the bot relays the email to a matched giver once, the encrypted blob is wiped. The bot never logs full email addresses. Details in [docs/privacy-retention.md](docs/privacy-retention.md).

## Related: codex-reset

If you already have a banked reset waiting and are stuck on Linux / a server / a terminal where the redeem button doesn't appear (see [openai/codex#27915](https://github.com/openai/codex/issues/27915)), the companion CLI tool [aaamosh/codex-reset](https://github.com/aaamosh/codex-reset) talks to the same `/wham/rate-limit-reset-credits/consume` endpoint the Codex desktop app uses, so you can spend the credit from the command line.

`codex-buddy` is the *acquisition* half (find a referral partner). `codex-reset` is the *redemption* half (spend the credit afterwards).

---

## For operators

`codex-hud` is a small TypeScript monorepo whose first app is `codex-buddy`. Two runtimes are scaffolded; only the first is currently in production:

- **`apps/buddy-server`** — Node/Hono + native SQLite, deployed on Server4 under systemd as `codex-buddy.service`. This is the live path.
- **`apps/buddy-bot`** — Cloudflare Worker/Hono + D1 + Durable Object. Scaffolded for a higher-volume future promo wave; not currently deployed.

Server4 activation state (as of last deploy):

- Telegram bot token and admin Telegram ID allowlist live in `/etc/codex-buddy/codex-buddy.env`.
- Telegram webhook registered for `@codexHuddbot` at the operator-configured HTTPS endpoint with the Server4 self-signed certificate.
- Bot name, command list, and EN/RU descriptions are set in the Telegram profile via `server:set-telegram-profile`.
- Server4 runtime is rechecked after behavior changes via systemd/nginx, loopback + public health, cron, Telegram webhook info, admin auth, and Server4 health-monitor evidence.
- Admin HTML is `lang=en`; the live admin response has no Cyrillic characters.
- A real operator click-through of `/give` and `/seek` reached Server4. The resulting state has one giver offer and one seeker request on the same Telegram user, so no match is created by design — self-referrals are blocked.
- `apps/buddy-bot/wrangler.toml` has real Cloudflare D1 IDs ready for the future path.

## Components

- `apps/buddy-server`: current Server4-native Node/Hono runtime, Telegram webhook, admin HTML/API, SQLite runtime, cron command.
- `apps/buddy-bot`: future Cloudflare Worker, Hono routes, Telegram webhook, Matchmaker Durable Object, admin HTML/API, cron handler.
- `packages/buddy`: shared business service for giver/seeker intake, matching, confirmations, cleanup, archive.
- `packages/core`: enums, state machine, matching, privacy, anti-abuse, archive, metrics.
- `packages/telegram`: Telegram API wrapper, callback parser, English bot copy, and inline keyboards.
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

## Standalone Invite Helper

The invite handoff helper now lives in its own engineering repo:

- Repo: `https://github.com/aaamosh/codex-invite-helper`
- Download: `https://github.com/aaamosh/codex-invite-helper/raw/main/invite-helper.html`
- Source: `https://github.com/aaamosh/codex-invite-helper/blob/main/invite-helper.html`

`codex-hud` only relays those GitHub links after `Show email`. It does not host,
embed, or own the helper HTML. The helper remains a readable single-file tool
with no external dependencies, no network calls, no cookies/tokens access, and
no OpenAI invite endpoint calls.

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
