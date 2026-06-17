import { describe, expect, it } from "vitest";
import { selectBestGiverOffer, type GiverOfferRecord, type SeekerRequestRecord } from "../src";

const baseOffer: GiverOfferRecord = {
  id: "offer",
  user_id: "giver",
  plan_type: "plus",
  language: "ru",
  region: "EU",
  timezone: "+02:00",
  capacity_total: 1,
  capacity_active: 1,
  state: "active",
  created_at: "2026-06-01T00:00:00.000Z",
  expires_at: null
};

const seeker: Pick<SeekerRequestRecord, "language" | "region" | "timezone"> = {
  language: "ru",
  region: "EU",
  timezone: "+03:00"
};

describe("matching", () => {
  it("prefers exact language and region with reliability tie-breakers", () => {
    const best = selectBestGiverOffer(seeker, [
      { ...baseOffer, id: "old", language: "en", created_at: "2026-06-02T00:00:00.000Z" },
      { ...baseOffer, id: "good", created_at: "2026-06-01T00:00:00.000Z" }
    ]);

    expect(best?.offer.id).toBe("good");
    expect(best?.reasons).toContain("language_exact");
    expect(best?.reasons).toContain("region_exact");
  });

  it("skips inactive, exhausted, and cooldown offers", () => {
    const best = selectBestGiverOffer(
      seeker,
      [
        { ...baseOffer, id: "paused", state: "paused" },
        { ...baseOffer, id: "empty", capacity_active: 0 },
        { ...baseOffer, id: "cooldown" },
        { ...baseOffer, id: "ok", created_at: "2026-06-03T00:00:00.000Z" }
      ],
      new Map([
        [
          "cooldown",
          {
            completed_matches: 0,
            expired_reservations: 0,
            reported_no_shows: 0,
            cooldown_until: "2026-06-10T00:00:00.000Z"
          }
        ]
      ]),
      new Date("2026-06-05T00:00:00.000Z")
    );

    expect(best?.offer.id).toBe("ok");
  });
});

