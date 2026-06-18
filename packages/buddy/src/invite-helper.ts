export const CODEX_INVITE_HELPER_GITHUB_REPO_URL = "https://github.com/aaamosh/codex-reset";
export const CODEX_INVITE_HELPER_FILE_PATH = "codex-reset.html";
export const CODEX_INVITE_HELPER_DOWNLOAD_URL =
  `${CODEX_INVITE_HELPER_GITHUB_REPO_URL}/raw/main/${CODEX_INVITE_HELPER_FILE_PATH}`;
export const CODEX_INVITE_HELPER_SOURCE_URL =
  `${CODEX_INVITE_HELPER_GITHUB_REPO_URL}/blob/main/${CODEX_INVITE_HELPER_FILE_PATH}`;

export function inviteHelperTelegramNote(): string {
  return (
    "Optional standalone Codex Reset browser companion for the official flow:\n" +
    `Download: ${CODEX_INVITE_HELPER_DOWNLOAD_URL}\n` +
    `Source: ${CODEX_INVITE_HELPER_SOURCE_URL}\n\n` +
    "It is a single readable HTML file. It does not send invites, redeem credits, call OpenAI endpoints, read cookies, or use tokens."
  );
}
