import { migrateSqliteDatabase, openBuddySqlite } from "@codex-hud/db-sqlite";
import { loadStorageEnv } from "./env";
import { sharedMigration } from "./paths";

const env = loadStorageEnv();
const { db } = openBuddySqlite(env.BUDDY_DB_PATH);
try {
  migrateSqliteDatabase(db, [sharedMigration]);
  console.log(JSON.stringify({ ok: true, db: env.BUDDY_DB_PATH }));
} finally {
  db.close();
}
