import type { BuddyRuntimeConfig } from "./types";

export function isArchiveMode(config: BuddyRuntimeConfig, now: Date = new Date()): boolean {
  if (config.archive_mode) return true;
  if (!config.promo_end_at) return false;
  return new Date(config.promo_end_at).getTime() <= now.getTime();
}

export function assertMatchingOpen(config: BuddyRuntimeConfig, now: Date = new Date()): { ok: true } | { ok: false; message: string } {
  if (!isArchiveMode(config, now)) return { ok: true };
  return { ok: false, message: config.archive_mode_message };
}

