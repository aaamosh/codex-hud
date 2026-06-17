export type MatchCallbackAction =
  | "rel"
  | "gs"
  | "gcannot"
  | "sr"
  | "snr"
  | "sdone"
  | "cancel";

export interface MatchCallbackData {
  kind: "match";
  action: MatchCallbackAction;
  matchId: string;
}

export interface SimpleCallbackData {
  kind: "simple";
  action: string;
  value?: string;
}

export type ParsedCallbackData = MatchCallbackData | SimpleCallbackData | null;

export function matchCallback(action: MatchCallbackAction, matchId: string): string {
  return `m|${action}|${matchId}`;
}

export function simpleCallback(action: string, value?: string): string {
  return value ? `s|${action}|${value}` : `s|${action}`;
}

export function parseCallbackData(data: string | undefined): ParsedCallbackData {
  if (!data) return null;
  const parts = data.split("|");
  if (parts[0] === "m" && parts.length === 3) {
    return { kind: "match", action: parts[1] as MatchCallbackAction, matchId: parts[2] ?? "" };
  }
  if (parts[0] === "s" && parts.length >= 2) {
    return { kind: "simple", action: parts[1] ?? "", value: parts[2] };
  }
  return null;
}

