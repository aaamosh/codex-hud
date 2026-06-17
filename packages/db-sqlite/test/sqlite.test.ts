import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openBuddySqlite, migrateSqliteDatabase } from "../src";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("SQLite D1 compatibility adapter", () => {
  it("runs the shared migration and repository queries", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-buddy-sqlite-"));
    tempDirs.push(dir);
    const { db, repo } = openBuddySqlite(join(dir, "buddy.sqlite"));

    migrateSqliteDatabase(db, [join(process.cwd(), "packages/db/migrations/0001_initial.sql")]);
    const user = await repo.upsertTelegramUser(
      { telegram_user_id: "42", username: "giver", first_name: "Giver", locale: "ru" },
      "2026-06-17T00:00:00.000Z"
    );
    const sameUser = await repo.getUserByTelegramId("42");

    expect(sameUser?.id).toBe(user.id);
    expect(await repo.markTelegramUpdate(1, "abc", "2026-06-17T00:01:00.000Z")).toBe(true);
    expect(await repo.markTelegramUpdate(1, "abc", "2026-06-17T00:01:00.000Z")).toBe(false);
    db.close();
  });
});
