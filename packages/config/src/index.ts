import { z } from "zod";
import type { BuddyRuntimeConfig } from "@codex-hud/core";

export const DEFAULT_CONFIG: BuddyRuntimeConfig = {
  promo_end_at: null,
  archive_mode: false,
  archive_mode_message:
    "Matching is paused because the current referral wave has ended. Status, rules, and help remain available.",
  max_giver_capacity_by_plan: {
    plus: 1,
    pro: 3
  },
  reservation_ttl_minutes: 90,
  completion_timeout_minutes: 24 * 60,
  plaintext_relay_ttl_minutes: 30,
  seeker_email_cooldown_hours: 7 * 24,
  cancel_spam_cooldown_minutes: 30,
  max_cancel_events_per_window: 3,
  allowed_regions: [],
  language_priority: ["ru", "en"]
};

export const runtimeConfigSchema = z.object({
  promo_end_at: z.string().datetime().nullable(),
  archive_mode: z.boolean(),
  archive_mode_message: z.string().min(1),
  max_giver_capacity_by_plan: z.object({
    plus: z.number().int().min(1).max(10),
    pro: z.number().int().min(1).max(25)
  }),
  reservation_ttl_minutes: z.number().int().min(5).max(24 * 60),
  completion_timeout_minutes: z.number().int().min(15).max(7 * 24 * 60),
  plaintext_relay_ttl_minutes: z.number().int().min(1).max(24 * 60),
  seeker_email_cooldown_hours: z.number().int().min(0).max(365 * 24),
  cancel_spam_cooldown_minutes: z.number().int().min(1).max(24 * 60),
  max_cancel_events_per_window: z.number().int().min(1).max(100),
  allowed_regions: z.array(z.string()),
  language_priority: z.array(z.string())
});

export function parseRuntimeConfig(value: unknown): BuddyRuntimeConfig {
  return runtimeConfigSchema.parse({ ...DEFAULT_CONFIG, ...(value as object) });
}

export function mergeConfigRows(rows: Array<{ key: string; value_json: string }>): BuddyRuntimeConfig {
  const patch: Record<string, unknown> = {};
  for (const row of rows) {
    patch[row.key] = JSON.parse(row.value_json);
  }
  return parseRuntimeConfig(patch);
}
