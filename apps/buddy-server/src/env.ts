import { z } from "zod";

const envSchema = z.object({
  BUDDY_DB_PATH: z.string().min(1).default("./var/codex-buddy.sqlite"),
  BUDDY_HOST: z.string().min(1).default("127.0.0.1"),
  BUDDY_PORT: z.coerce.number().int().positive().default(8788),
  BUDDY_PUBLIC_BASE_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_CERT_PATH: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_SECRET_TOKEN: z.string().optional(),
  ADMIN_TOKEN: z.string().min(16),
  ADMIN_TELEGRAM_IDS: z.string().optional(),
  EMAIL_ENCRYPTION_KEY: z.string().min(16),
  EMAIL_HASH_PEPPER: z.string().min(16)
});

const storageEnvSchema = z.object({
  BUDDY_DB_PATH: z.string().min(1).default("./var/codex-buddy.sqlite")
});

export type ServerEnv = z.infer<typeof envSchema>;
export type StorageEnv = z.infer<typeof storageEnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid codex-buddy server env: ${details}`);
  }
  return parsed.data;
}

export function loadStorageEnv(source: NodeJS.ProcessEnv = process.env): StorageEnv {
  const parsed = storageEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid codex-buddy storage env: ${details}`);
  }
  return parsed.data;
}
