# Privacy And Retention

Email handling:

- normalized full email is accepted only through seeker intake
- HMAC-SHA-256 hash is stored for dedupe and anti-abuse
- masked email is stored for UI and operator views
- encrypted full email is stored temporarily for relay
- full email is shown only to the matched giver after they press the relay button
- ciphertext is cleared after successful relay message delivery
- cron clears old ciphertext after `plaintext_relay_ttl_minutes`

Operator UI:

- shows masked email only
- exports masked email only

Logs and audit:

- do not log raw Telegram update payloads
- store update payload hashes only
- audit metadata may include email hash, never full email

Retention:

- `email_hash` may be retained for configured anti-abuse history
- `archived_records` store seeker snapshots with `email_ciphertext` removed
- blocking and abuse flags are retained until manually removed or a future retention job is added

