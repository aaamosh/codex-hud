import { BuddyService, type ServiceSecrets } from "@codex-hud/buddy";
import type { D1BuddyRepository } from "@codex-hud/db";
import type { Env } from "./env";

export * from "@codex-hud/buddy";

export function secretsFromEnv(env: Env): ServiceSecrets {
  return {
    emailEncryptionKey: env.EMAIL_ENCRYPTION_KEY,
    emailHashPepper: env.EMAIL_HASH_PEPPER
  };
}

export function serviceFromRepo(repo: D1BuddyRepository, env: Env): BuddyService {
  return new BuddyService(repo, secretsFromEnv(env));
}
