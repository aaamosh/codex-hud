# Admin Usage

Open the admin surface:

```text
https://<public-bot-host>/admin?token=<ADMIN_TOKEN>
```

Use Bearer auth for API calls:

```bash
curl -k -H "Authorization: Bearer $ADMIN_TOKEN" https://<public-bot-host>/admin/api/snapshot
```

For the future Cloudflare deploy path, replace the host with the Worker URL.

Capabilities:

- list active giver offers
- list active seeker requests
- list recent matches
- cancel or resolve matches
- block users
- set `promo_end_at`
- toggle `archive_mode`
- set the internal max giver capacity JSON
- export JSON or CSV report
- view aggregate metrics

Admin UI shows masked email only.
Plan/language/region/timezone are internal compatibility fields for the current MVP and are not collected from users.
