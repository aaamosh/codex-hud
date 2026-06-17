export interface Env {
  DB: D1Database;
  MATCHMAKER: DurableObjectNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET_TOKEN?: string;
  ADMIN_TOKEN: string;
  ADMIN_TELEGRAM_IDS?: string;
  EMAIL_ENCRYPTION_KEY: string;
  EMAIL_HASH_PEPPER: string;
}

