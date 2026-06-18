import { describe, expect, it } from "vitest";
import {
  CODEX_INVITE_HELPER_DOWNLOAD_URL,
  CODEX_INVITE_HELPER_FILE_PATH,
  CODEX_INVITE_HELPER_GITHUB_REPO_URL,
  CODEX_INVITE_HELPER_SOURCE_URL,
  inviteHelperTelegramNote
} from "../src/invite-helper";

describe("standalone invite helper link", () => {
  it("points outside codex-hud to the dedicated helper repo", () => {
    expect(CODEX_INVITE_HELPER_GITHUB_REPO_URL).toBe("https://github.com/aaamosh/codex-invite-helper");
    expect(CODEX_INVITE_HELPER_FILE_PATH).toBe("invite-helper.html");
    expect(CODEX_INVITE_HELPER_DOWNLOAD_URL).toBe(
      "https://github.com/aaamosh/codex-invite-helper/raw/main/invite-helper.html"
    );
    expect(CODEX_INVITE_HELPER_SOURCE_URL).toBe(
      "https://github.com/aaamosh/codex-invite-helper/blob/main/invite-helper.html"
    );
  });

  it("keeps relay copy transparent and non-automated", () => {
    const note = inviteHelperTelegramNote();
    const oldAssetName = ["codex", "buddy", "invite", "helper"].join("-");
    expect(note).toContain("standalone Codex Invite Helper");
    expect(note).toContain(CODEX_INVITE_HELPER_DOWNLOAD_URL);
    expect(note).toContain(CODEX_INVITE_HELPER_SOURCE_URL);
    expect(note).toContain("does not send invites");
    expect(note).toContain("call OpenAI endpoints");
    expect(note).toContain("read cookies");
    expect(note).not.toContain("codex-hud/raw");
    expect(note).not.toContain(oldAssetName);
  });

  it("keeps the old asset path as a pointer only", async () => {
    const html = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../../assets/codex-buddy-invite-helper.html", import.meta.url), "utf8")
    );
    expect(html).toContain("Moved to codex-invite-helper");
    expect(html).toContain(CODEX_INVITE_HELPER_DOWNLOAD_URL);
    expect(html).toContain(CODEX_INVITE_HELPER_SOURCE_URL);
    expect(html).not.toContain("Paste the recipient email");
    expect(html).not.toContain("Copy checklist");
    expect(html).not.toContain("No OpenAI invite endpoint calls");
  });
});
