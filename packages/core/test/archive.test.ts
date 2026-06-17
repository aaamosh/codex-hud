import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@codex-hud/config";
import { isArchiveMode } from "../src";

describe("archive mode", () => {
  it("activates when explicit or promo_end_at is in the past", () => {
    expect(isArchiveMode({ ...DEFAULT_CONFIG, archive_mode: true })).toBe(true);
    expect(
      isArchiveMode(
        { ...DEFAULT_CONFIG, promo_end_at: "2026-06-01T00:00:00.000Z" },
        new Date("2026-06-02T00:00:00.000Z")
      )
    ).toBe(true);
    expect(
      isArchiveMode(
        { ...DEFAULT_CONFIG, promo_end_at: "2026-06-03T00:00:00.000Z" },
        new Date("2026-06-02T00:00:00.000Z")
      )
    ).toBe(false);
  });
});
