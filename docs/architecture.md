# codex-buddy Architecture

`codex-buddy` has one shared business layer and two hosting adapters.

## Shared Layer

- `packages/buddy`: giver/seeker intake, matching orchestration, confirmation loop, cleanup, archive.
- `packages/core`: state machine, matching scoring, privacy helpers, anti-abuse, metrics.
- `packages/telegram`: Telegram API, callback parsing, English copy, inline keyboards.
- `packages/db/migrations`: shared SQL schema.

The system never sends OpenAI invites automatically and has no OpenAI API dependency in core logic.

Current matching is deliberately broad. The bot does not ask users to classify themselves by plan, language, region, or timezone. It stores compatibility defaults for those schema fields and lets any active giver slot match any eligible seeker request, with anti-abuse and slot capacity as the real constraints.

## Current Server4 Runtime

1. Server4 nginx receives HTTPS on `8443/tcp`.
2. nginx proxies to `apps/buddy-server` on `127.0.0.1:18788`.
3. Node/Hono validates `X-Telegram-Bot-Api-Secret-Token` when configured.
4. SQLite stores `telegram_updates.update_id` with a SHA-256 payload hash for idempotency.
5. Minimal bot onboarding creates `giver_offers` or `seeker_requests`.
6. A process-local serial queue protects match-critical calls.
7. SQLite remains the canonical persistent store.
8. `codex-buddy-cron.timer` runs pending matching, expiry, cleanup, archive, and reminders.

This runtime is intended as a simple one-process MVP. Do not run multiple app instances against the same SQLite file unless a database-backed lock replaces the process-local queue.

## Future Cloudflare Runtime

1. Telegram sends updates to Worker `/telegram/webhook`.
2. Worker validates `X-Telegram-Bot-Api-Secret-Token` when configured.
3. D1 stores `telegram_updates.update_id` with a SHA-256 payload hash.
4. Minimal Worker onboarding creates `giver_offers` or `seeker_requests`.
5. Matchmaker Durable Object serializes critical matching and callback actions.
6. D1 remains the canonical persistent store.
7. Cloudflare Cron runs pending matching, expiry, cleanup, archive, and reminders.
