import { D1BuddyRepository } from "@codex-hud/db";
import { migrateSqliteDatabase, openBuddySqlite, type SQLiteD1Database } from "@codex-hud/db-sqlite";
import { sharedMigration } from "./paths";

export interface ServerDatabase {
  db: SQLiteD1Database;
  repo: D1BuddyRepository;
}

export function openServerDatabase(path: string, options: { migrate?: boolean } = {}): ServerDatabase {
  const opened = openBuddySqlite(path);
  if (options.migrate) migrateSqliteDatabase(opened.db, [sharedMigration]);
  return opened;
}
