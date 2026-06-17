export function median(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (clean.length === 0) return null;
  const middle = Math.floor(clean.length / 2);
  if (clean.length % 2 === 1) return clean[middle] ?? null;
  return ((clean[middle - 1] ?? 0) + (clean[middle] ?? 0)) / 2;
}

export function durationMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
}

