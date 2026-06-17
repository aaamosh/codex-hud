import type { GiverOfferRecord, GiverReliabilityStats, SeekerRequestRecord } from "./types";

export interface ScoredGiverOffer {
  offer: GiverOfferRecord;
  score: number;
  reasons: string[];
}

export function selectBestGiverOffer(
  seeker: Pick<SeekerRequestRecord, "language" | "region" | "timezone">,
  offers: GiverOfferRecord[],
  reliabilityByOfferId: Map<string, GiverReliabilityStats> = new Map(),
  now: Date = new Date()
): ScoredGiverOffer | null {
  const scored = offers
    .filter((offer) => offer.state === "active" && offer.capacity_active > 0)
    .map((offer) => scoreGiverOffer(seeker, offer, reliabilityByOfferId.get(offer.id), now))
    .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.offer.created_at).getTime() - new Date(left.offer.created_at).getTime();
    });

  return scored[0] ?? null;
}

export function scoreGiverOffer(
  seeker: Pick<SeekerRequestRecord, "language" | "region" | "timezone">,
  offer: GiverOfferRecord,
  reliability: GiverReliabilityStats | undefined,
  now: Date = new Date()
): ScoredGiverOffer {
  const reasons: string[] = [];
  if (reliability?.cooldown_until && new Date(reliability.cooldown_until).getTime() > now.getTime()) {
    return { offer, score: Number.NEGATIVE_INFINITY, reasons: ["cooldown"] };
  }

  let score = 0;
  if (normalizeTag(offer.language) === normalizeTag(seeker.language)) {
    score += 10_000;
    reasons.push("language_exact");
  }
  if (normalizeTag(offer.region) === normalizeTag(seeker.region)) {
    score += 1_000;
    reasons.push("region_exact");
  }

  const timezoneScore = scoreTimezoneProximity(seeker.timezone, offer.timezone);
  score += timezoneScore;
  if (timezoneScore > 0) reasons.push("timezone_near");

  if (reliability) {
    const reliabilityScore =
      reliability.completed_matches * 20 -
      reliability.expired_reservations * 35 -
      reliability.reported_no_shows * 50;
    score += reliabilityScore;
    reasons.push(`reliability:${reliabilityScore}`);
  }

  score += Math.min(offer.capacity_active, 5);
  return { offer, score, reasons };
}

export function scoreTimezoneProximity(left: string, right: string): number {
  const leftOffset = parseUtcOffsetHours(left);
  const rightOffset = parseUtcOffsetHours(right);
  if (leftOffset === null || rightOffset === null) {
    return normalizeTag(left) === normalizeTag(right) ? 250 : 0;
  }
  const distance = Math.abs(leftOffset - rightOffset);
  return Math.max(0, 300 - distance * 50);
}

function parseUtcOffsetHours(value: string): number | null {
  const match = value.trim().match(/^(?:utc|gmt)?\s*([+-])?(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = match[3] ? Number(match[3]) : 0;
  if (hours > 14 || minutes > 59) return null;
  return sign * (hours + minutes / 60);
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

