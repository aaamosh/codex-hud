export const CODEX_BUDDY_GITHUB_REPO_URL = "https://github.com/aaamosh/codex-hud";
export const CODEX_BUDDY_INVITE_HELPER_ASSET_PATH = "assets/codex-buddy-invite-helper.html";
export const CODEX_BUDDY_INVITE_HELPER_DOWNLOAD_URL =
  `${CODEX_BUDDY_GITHUB_REPO_URL}/raw/main/${CODEX_BUDDY_INVITE_HELPER_ASSET_PATH}`;
export const CODEX_BUDDY_INVITE_HELPER_SOURCE_URL =
  `${CODEX_BUDDY_GITHUB_REPO_URL}/blob/main/${CODEX_BUDDY_INVITE_HELPER_ASSET_PATH}`;
export const CODEX_BUDDY_INVITE_HELPER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export function inviteHelperTelegramNote(): string {
  return (
    "Optional transparent helper for manual flow:\n" +
    `Download: ${CODEX_BUDDY_INVITE_HELPER_DOWNLOAD_URL}\n` +
    `Source: ${CODEX_BUDDY_INVITE_HELPER_SOURCE_URL}\n\n` +
    "It is a single readable HTML file. It does not send invites, call OpenAI endpoints, read cookies, or use tokens."
  );
}
