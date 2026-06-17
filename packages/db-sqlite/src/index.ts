import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { D1BuddyRepository, type D1DatabaseLike, type D1PreparedStatementLike } from "@codex-hud/db";

export class SQLiteD1Database implements D1DatabaseLike {
  readonly raw: DatabaseSync;

  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA foreign_keys = ON");
    this.raw.exec("PRAGMA journal_mode = WAL");
    this.raw.exec("PRAGMA busy_timeout = 5000");
  }

  prepare(query: string): D1PreparedStatementLike {
    return new SQLiteD1PreparedStatement(this.raw.prepare(query));
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  close(): void {
    this.raw.close();
  }

  transaction<T>(fn: () => T): T {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }
}

export class SQLiteD1PreparedStatement implements D1PreparedStatementLike {
  constructor(
    private readonly statement: StatementSync,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    return new SQLiteD1PreparedStatement(this.statement, values.map((value) => value ?? null));
  }

  async first<T = unknown>(): Promise<T | null> {
    return (this.statement.get(...sqlValues(this.values)) as T | undefined) ?? null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: this.statement.all(...sqlValues(this.values)) as T[] };
  }

  async run(): Promise<{ success: boolean; meta?: { changes?: number } }> {
    const result = this.statement.run(...sqlValues(this.values));
    return { success: true, meta: { changes: Number(result.changes ?? 0) } };
  }
}

export function openBuddySqlite(path: string): { db: SQLiteD1Database; repo: D1BuddyRepository } {
  const db = new SQLiteD1Database(path);
  return { db, repo: new D1BuddyRepository(db) };
}

export function migrateSqliteDatabase(db: SQLiteD1Database, migrationFiles: string[]): void {
  db.transaction(() => {
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const file of migrationFiles) {
      const version = migrationVersion(file);
      const existing = db.raw
        .prepare("SELECT version FROM schema_migrations WHERE version = ?1")
        .get(version) as { version: string } | undefined;
      if (existing) continue;
      db.exec(readFileSync(file, "utf8"));
      db.raw
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)")
        .run(version, new Date().toISOString());
    }
  });
}

function migrationVersion(file: string): string {
  const name = file.split(/[\\/]/).at(-1) ?? file;
  return name.replace(/\.sql$/i, "");
}

function sqlValues(values: unknown[]): SQLInputValue[] {
  return values.map((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
    if (value instanceof Uint8Array) return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return String(value);
  });
}
