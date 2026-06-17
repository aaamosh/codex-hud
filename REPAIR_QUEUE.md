schema: codex_hud_repair_queue.v1
status: active

open_repairs: []

closed_repairs:
  - id: RQ-2026-06-17-085
    status: completed
    priority: P2
    scope: server4_minimal_intake_live_clickthrough
    summary: >-
      Server4 runtime and admin acceptance are verified after the minimal-intake
      deploy. A real operator Telegram click-through of the simplified `/give`
      and `/seek` intake reached Server4, exposed stale non-English live copy and
      confusing self-referral pending UX, and was closed by deploying the
      English-only matching wakeup fix in commit `87bf703`.
    closure_evidence:
      - Server4 `curl -fsS http://127.0.0.1:18788/healthz` returned `runtime=server4-node`.
      - Server4 public `/healthz` returned `runtime=server4-node`.
      - Server4 admin auth gate returned `401` without token and `200` with `Authorization: Bearer <ADMIN_TOKEN>`.
      - `server4-health-monitor doctor --env-file /opt/server4-health-monitor/.env` reported `failing_check_count=0`.
      - `CODEX-BUDDY-VERIFY-20260617` recheck through `fleet-manual-ops-audit` confirmed `codex-buddy.service`, `codex-buddy-cron.timer`, and `nginx.service` active; `server:cron` returned `ok=true`; env status remained `telegram_token_status=placeholder` and `admin_telegram_ids_status=empty`.
      - `CODEX-BUDDY-ACTIVATE-TELEGRAM-20260617C` installed the real Telegram token and admin allowlist in `/etc/codex-buddy/codex-buddy.env`, restarted `codex-buddy.service`, registered the webhook, and `getWebhookInfo` returned the operator-configured HTTPS webhook URL with `has_custom_certificate=true`, `pending_update_count=0`, and `last_error_message=null`.
      - `CODEX-BUDDY-TELEGRAM-PROFILE-CHECK-20260617` verified 11 Telegram commands plus the bot short/full profile descriptions.
      - A real operator Telegram `/start` and old giver intake reached Server4 before the minimal-intake update; Server4 state showed one Telegram user and one active giver offer.
      - Local and Server4 `npm run typecheck` plus `npm test` passed for commit `0d73df6`, including the server webhook-shaped minimal-intake test.
      - `CODEX-BUDDY-POST-DEPLOY-HEALTH-20260617` confirmed `codex-buddy.service`, `codex-buddy-cron.timer`, and `nginx.service` active; loopback and public `/healthz` returned `runtime=server4-node`.
      - `CODEX-BUDDY-LIVE-VERIFY-20260617B` confirmed Server4 worktree `0d73df6` clean, admin auth `401/200`, cron `ok=true`, Telegram webhook with no pending updates or last error, and `server4-health-monitor doctor` with `failing_check_count=0`.
      - Isolated browser session `codex-buddy-server4-admin` opened the actual Server4 admin URL, exercised JSON/CSV export and idempotent config save, verified desktop/mobile no-overflow states, and saved evidence screenshots under `/tmp/codex-buddy-server4-admin*.png`.
      - The user-provided real Telegram screenshots on 2026-06-17 showed the simplified intake reaching Server4 but still using stale non-English copy and leaving a seeker pending next to the same user's active giver offer.
      - Commit `87bf703` changed the Server4 and Cloudflare paths to English admin metadata, immediate pending-seeker wakeup after giver creation, per-message Telegram outbox isolation, and a regression test for seeker-first then giver-created matching.
      - Local `npm run typecheck`, local `npm test`, and Server4 `npm run typecheck` plus `npm test` passed for commit `87bf703`.
      - `CODEX-BUDDY-LIVE-FIX-20260617D` confirmed Server4 worktree `87bf703` clean, loopback and public health OK, admin HTML `lang=en`, live admin HTML `admin_has_cyrillic=false`, cron `ok=true`, Telegram profile setup `ok=true`, Telegram webhook `pending_update_count=0` and `last_error_message=null`, and Server4 health monitor `failing_check_count=0`.
      - `CODEX-BUDDY-LIVE-FIX-20260617G` confirmed live masked state: `users=1`, `activeGiverOffers=1`, `activeSeekerRequests=1`, `matches=0`, and the pending seeker has `same_user_as_active_offer=true`; this is the intended self-referral block, not a broken matcher.
    owner: codex_buddy_operator
    last_reviewed: "2026-06-17"

closure_policy:
  - Add an entry here for mandatory deferred repairs that belong to codex-hud.
  - Mirror open high-level entries into /home/amosh/Priv/Projects/REPAIR_QUEUE.md only when they are mandatory deferred work under the Projects contract.
  - Close entries only with evidence or an explicit mitigation/residual-risk note.
