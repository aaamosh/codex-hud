schema: codex_hud_best_practices.v1
status: active

records:
  - id: BP-2026-06-17-001
    scope: codex-buddy privacy relay
    trigger: human needs full seeker email for official invite flow but product must not retain plaintext longer than needed
    guardrail: show masked email by default, store keyed hash for dedupe, encrypt full email for short relay only, relay full email once after explicit giver action, clear ciphertext after successful Telegram delivery, and keep cron cleanup as backup
    validation:
      - packages/core/test/privacy.test.ts
      - apps/buddy-bot/test/integration-flow.test.ts
      - docs/privacy-retention.md
    fitness_metric: future email-bearing flows should have no plaintext email in admin UI, logs, fixtures, exports, or long-lived storage

  - id: BP-2026-06-17-002
    scope: codex-buddy admin UI verification
    trigger: empty-state browser tests can miss mobile overflow caused by populated operational rows
    guardrail: include a populated-row mobile overflow check in the checked-in browser harness and repeat isolated-browser visual acceptance after fixing CSS
    validation:
      - apps/buddy-bot/test/browser/admin-ui.spec.ts
      - /tmp/codex-buddy-admin-mobile-fixed.png
    fitness_metric: admin UI changes should pass both empty/default surface checks and populated-row mobile bounds checks

  - id: BP-2026-06-17-003
    scope: codex-buddy dual runtime
    trigger: the same product must run on a fast Server4 MVP path now and a Cloudflare promo path later
    guardrail: keep product behavior in shared packages and make hosting adapters thin; persistence adapters may differ, but state machine, privacy relay, anti-abuse, and matching service must not be forked per host
    validation:
      - packages/buddy/src/index.ts
      - apps/buddy-server/test/server-flow.test.ts
      - apps/buddy-bot/test/integration-flow.test.ts
    fitness_metric: future runtime-specific work should not duplicate or drift matching/privacy behavior between Server4 and Cloudflare

  - id: BP-2026-06-17-004
    scope: codex-buddy Server4 deploy hygiene
    trigger: Server4 npm 10.9.7 rewrote optional dependency `libc` metadata in `package-lock.json` during `npm install`
    guardrail: use `npm ci` for Server4 deploy/install from the committed lockfile; treat lockfile edits produced on the server as deploy noise unless intentionally changing dependencies
    validation:
      - docs/server4-deployment.md
      - docs/deployment-checklist.md
    fitness_metric: Server4 `/opt/projects/codex-hud` should stay clean after dependency installation

  - id: BP-2026-06-17-005
    scope: codex-buddy Server4 CLI env hygiene
    trigger: manual Server4 commands such as `server:set-webhook` run outside systemd and therefore do not inherit `/etc/codex-buddy/codex-buddy.env`
    guardrail: source `/etc/codex-buddy/codex-buddy.env` with `set -a` before manual Server4 npm scripts that need runtime secrets or public URL config
    validation:
      - README.md
      - docs/server4-deployment.md
      - docs/deployment-checklist.md
      - docs/operator-runbook.md
    fitness_metric: future webhook, cron, seed, and diagnostic commands should not fail because required env vars existed only in the systemd `EnvironmentFile`

  - id: BP-2026-06-17-006
    scope: codex-buddy technical-audience intake
    trigger: plan/language/region/timezone questions added friction and looked like unnecessary data collection for a technically capable referral audience
    guardrail: collect only fields that directly unlock the official human flow in the current wave; keep plan/language/region/timezone as internal compatibility defaults unless a future promo proves they improve outcomes
    validation:
      - apps/buddy-server/test/server-flow.test.ts
      - apps/buddy-server/src/telegram-handler.ts
      - apps/buddy-bot/src/telegram/handler.ts
      - docs/operator-runbook.md
    fitness_metric: current-wave Telegram intake should complete giver setup with one user answer and seeker setup with email plus availability only

  - id: BP-2026-06-17-007
    scope: codex-buddy Server4 verification scripts
    trigger: inline remote `node -e` and heredoc SQL checks failed under nested SSH plus `fleet-manual-ops-audit` quoting during live Server4 verification
    guardrail: use a staged temporary script for multi-step Server4 verification that parses JSON, reads SQLite, calls Telegram/Admin APIs, or handles secret-bearing env; reserve inline audited commands for short shell probes only
    validation:
      - `CODEX-BUDDY-LIVE-VERIFY-20260617B`
      - `CODEX-BUDDY-POST-DEPLOY-HEALTH-20260617`
      - `CODEX-BUDDY-CONFIG-AFTER-ADMIN-SAVE-20260617B`
    fitness_metric: future Server4 live verification should have no repeated quoting failures before collecting health/admin/webhook evidence

  - id: BP-2026-06-17-008
    scope: codex-buddy Telegram matching UX
    trigger: a real one-account Telegram click-through looked stuck because seeker and giver records from the same Telegram user correctly cannot self-match, while stale live copy still used non-English text
    guardrail: after Telegram UX changes, verify the live deployed bot state as well as local tests; status copy must explain self-referral pending states, and creating a new giver offer must immediately wake pending seekers instead of waiting only for cron
    validation:
      - apps/buddy-server/test/server-flow.test.ts
      - apps/buddy-server/src/telegram-handler.ts
      - apps/buddy-server/src/runtime.ts
      - packages/buddy/src/index.ts
      - `CODEX-BUDDY-LIVE-FIX-20260617D`
      - `CODEX-BUDDY-LIVE-FIX-20260617G`
    fitness_metric: future Telegram matching changes should prove both self-referral explanation and two-user seeker-first matching before claiming the bot is not stuck

  - id: BP-2026-06-17-009
    scope: codex-hud public repository history hygiene
    trigger: a young public MVP repo needed the current state to be free of Cyrillic characters in both checkout and reachable Git history
    guardrail: for this repository, publish a single-current-state history after confirming the checkout is clean; keep any pre-rewrite backup bundle outside the repo, and verify a fresh clone with `git grep -n -I -P '\p{Cyrillic}' -- .`
    validation:
      - README.md
      - fresh clone verification after force-push
    fitness_metric: future public repo hygiene work should prove both current tree and reachable history constraints rather than checking rendered UI only

  - id: BP-2026-06-17-010
    scope: codex-buddy Telegram live profile and retry UX
    trigger: a locale-specific Telegram client still showed stale bot profile text, and cron repeated the same self-referral no-match message every retry pass
    guardrail: update and verify Telegram Bot API metadata for default, `en`, and `ru` profile scopes; cron and scheduled retries must stay silent on no-match outcomes while explicit user actions may send one explanatory status message
    validation:
      - apps/buddy-server/src/set-telegram-profile.ts
      - packages/buddy/src/index.ts
      - apps/buddy-bot/test/integration-flow.test.ts
    fitness_metric: future Telegram UX changes should verify live Bot API metadata by locale and prove no-match retry paths do not spam unchanged status text

  - id: BP-2026-06-17-011
    scope: codex-buddy manual invite expectation
    trigger: a successful two-user match made the seeker expect an OpenAI email before the giver had manually sent the invite through the official OpenAI flow
    guardrail: separate "giver assigned" from "invite sent" in Telegram copy; seeker-facing copy must say the bot does not send OpenAI invite emails, and closed/completed seeker requests must clear encrypted email relay ciphertext immediately
    validation:
      - packages/buddy/src/index.ts
      - packages/db/src/d1.ts
      - apps/buddy-server/test/server-flow.test.ts
      - docs/operator-runbook.md
    fitness_metric: future match-flow tests should confirm seeker waits for the giver's `Invite sent` action before expecting email, and closed requests retain no encrypted plaintext email

  - id: BP-2026-06-17-012
    scope: codex-buddy GitHub-only invite helper
    trigger: a transparent helper should help Linux/CLI users complete the official human flow without exposing the Server4 host or implying automated invite sending
    guardrail: publish the helper only as a readable GitHub asset, link Telegram relay copy to GitHub raw/source URLs, keep the helper network-free, and keep real Server4 host/IP values out of public repo text and Git history
    validation:
      - assets/codex-buddy-invite-helper.html
      - packages/buddy/test/invite-helper-asset.test.ts
      - apps/buddy-bot/test/integration-flow.test.ts
      - public repo hygiene scan before visibility switch
    fitness_metric: future helper changes should preserve GitHub-only distribution, no Server4-host exposure, and no OpenAI mutation automation

  - id: BP-2026-06-18-001
    scope: codex-buddy Server4 SQLite admin inspection
    trigger: live admin diagnosis needed SQLite timeline data, and nested SSH plus inline JavaScript quoting repeatedly delayed read-only evidence collection
    guardrail: keep the Server4 `sqlite3` CLI available for operator diagnostics; use `sqlite3 -readonly` with simple queries or a staged SQL file, and never print plaintext email, `email_hash`, `email_ciphertext`, tokens, or raw host values
    validation:
      - docs/operator-runbook.md
      - `CODEX-BUDDY-SQLITE3-INSTALL-20260618`
      - `CODEX-BUDDY-ADMIN-READONLY-20260618I`
    fitness_metric: future live SQLite investigations should collect sanitized timeline evidence without repeated nested quoting failures or sensitive-value leakage
