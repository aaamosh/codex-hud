# Operator Runbook

## Normal Operation

Use the Telegram bot commands:

- `/start`
- `/give`
- `/seek`
- `/status`
- `/pause`
- `/resume`
- `/cancel`
- `/confirmed`
- `/rules`
- `/help`
- `/admin`

Current Server4 admin URL is operator-configured and is not exposed by the bot.

```text
https://<public-bot-host>/admin?token=<ADMIN_TOKEN>
```

The admin UI shows masked email by default. Full seeker email is relayed only to the matched giver after explicit `Show email`, then ciphertext is cleared after successful Telegram delivery.

Match testing note: the bot does not send OpenAI invite emails. After a match, the giver must press `Show email`, copy the relayed email into the official OpenAI Codex invite flow, send the invite there, and only then press `Invite sent`. The seeker should expect an email only after that manual giver step.

Helper note: after `Show email`, the giver receives GitHub download/source links for `assets/codex-buddy-invite-helper.html`. The helper is not hosted on Server4 and must remain a readable single-file HTML with no network calls, no cookies/tokens access, and no OpenAI invite endpoint calls.

Current intake:

- `/give` asks only for active invite slots
- `/seek` asks only for invite email and quick-action availability
- plan/language/region/timezone are internal compatibility defaults and should not be treated as matching filters in this MVP

## Server4 Operations

Check service:

```bash
systemctl status --no-pager codex-buddy.service codex-buddy-cron.timer
journalctl -u codex-buddy.service -n 100 --no-pager
curl -fsS http://127.0.0.1:18788/healthz
curl -k -fsS https://<public-bot-host>/healthz
```

Run one cleanup pass:

```bash
npm --prefix /opt/projects/codex-hud run server:cron
```

When running CLI commands manually, source `/etc/codex-buddy/codex-buddy.env` first or export the required variables for that command.

Re-register Telegram webhook after certificate/base URL changes:

```bash
set -a
. /etc/codex-buddy/codex-buddy.env
set +a
npm --prefix /opt/projects/codex-hud run server:set-webhook
npm --prefix /opt/projects/codex-hud run server:set-telegram-profile
```

`server:set-telegram-profile` updates the bot name, command list, short description, and full description for the default, `en`, and `ru` Telegram profile scopes. Re-run it after changing profile copy or when a locale-specific Telegram client shows stale metadata.

## Promo Sunset

Set `promo_end_at` in admin config. After it passes:

- new matches stop
- active intents archive
- status/help/admin remain available
- bot explains that matching is paused

To re-enable a future wave:

1. Set `archive_mode=false`.
2. Set a future `promo_end_at` or `null`.
3. Confirm caps/cooldowns.
4. Send a test `/give` and `/seek`.

## Abuse Handling

Use block when:

- repeated no-show reports
- obvious duplicate/throwaway behavior
- marketplace/sales attempts
- self-referral attempts

The system already blocks:

- one active seeker request per Telegram user
- active/recent duplicate email hash
- cancellation spam by user

## Incident Notes

Never paste full seeker email into tickets, logs, screenshots, or reports. Use masked email or email hash only.

The bot never sends OpenAI invites automatically and has no OpenAI API dependency in core logic.
