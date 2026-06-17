export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

export function addMinutesIso(source: string | Date, minutes: number): string {
  const date = typeof source === "string" ? new Date(source) : source;
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export function addHoursIso(source: string | Date, hours: number): string {
  const date = typeof source === "string" ? new Date(source) : source;
  return new Date(date.getTime() + hours * 3_600_000).toISOString();
}

export function isBeforeIso(left: string, right: string | Date): boolean {
  const rightDate = typeof right === "string" ? new Date(right) : right;
  return new Date(left).getTime() < rightDate.getTime();
}

export function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
}

