import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CODEX_BUDDY_INVITE_HELPER_CSP,
  CODEX_BUDDY_INVITE_HELPER_DOWNLOAD_URL,
  CODEX_BUDDY_INVITE_HELPER_SOURCE_URL
} from "../src/invite-helper";

const helperPath = fileURLToPath(new URL("../../../assets/codex-buddy-invite-helper.html", import.meta.url));

describe("invite helper asset", () => {
  const html = readFileSync(helperPath, "utf8");

  it("is an ASCII-only transparent standalone HTML file", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("codex-buddy invite helper");
    expect(html).toContain("Official flow only");
    expect(html).toContain("This page does not send invites");
    expect(html).toContain("No OpenAI invite endpoint calls");
    expect(/[^\x00-\x7F]/.test(html)).toBe(false);
    expect(/[\u0400-\u04FF]/u.test(html)).toBe(false);
  });

  it("contains the GitHub source and download links", () => {
    expect(html).toContain(CODEX_BUDDY_INVITE_HELPER_DOWNLOAD_URL);
    expect(html).toContain(CODEX_BUDDY_INVITE_HELPER_SOURCE_URL);
  });

  it("declares a no-connect CSP and has no automatic network primitives", () => {
    expect(html).toContain(CODEX_BUDDY_INVITE_HELPER_CSP);
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toMatch(/<script\s+[^>]*src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).not.toMatch(/<form\b/i);
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/\bXMLHttpRequest\s*\(/);
    expect(html).not.toMatch(/\bWebSocket\s*\(/);
    expect(html).not.toMatch(/\bEventSource\s*\(/);
    expect(html).not.toMatch(/\bsendBeacon\s*\(/);
  });
});
