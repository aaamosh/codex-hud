# Migration Notes

Migration directory:

```text
packages/db/migrations
```

Server4 SQLite apply:

```bash
npm run server:migrate
```

Server4 SQLite inspect:

```bash
sqlite3 /var/lib/codex-buddy/codex-buddy.sqlite ".tables"
```

Cloudflare local apply:

```bash
npm run migrate:local
```

Cloudflare remote apply:

```bash
npm run migrate:remote
```

Cloudflare local inspect:

```bash
npx wrangler d1 execute codex_hud_buddy --local --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Cloudflare remote inspect:

```bash
npx wrangler d1 execute codex_hud_buddy --remote --command "SELECT COUNT(*) FROM users;"
```

Do not put plaintext email into migrations, seed files, fixtures, or manual SQL.
