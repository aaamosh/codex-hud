import { loadEnv } from "./env";

const env = loadEnv();

const commands = [
  { command: "start", description: "Open the intro and main actions" },
  { command: "give", description: "Offer active invite slots" },
  { command: "seek", description: "Request a Codex invite match" },
  { command: "status", description: "Show your current records" },
  { command: "pause", description: "Pause active giver offers" },
  { command: "resume", description: "Resume paused giver offers" },
  { command: "cancel", description: "Cancel active records" },
  { command: "confirmed", description: "Help with match confirmation" },
  { command: "rules", description: "Show service rules" },
  { command: "help", description: "Show command help" },
  { command: "admin", description: "Show admin access hint" }
];

const shortDescription = "Human-to-human Codex referral matching. Official flow only.";
const description =
  "codex-buddy helps real people pair up for the official OpenAI Codex referral flow. " +
  "No selling, farming, self-referrals, or automated invite sending.";
const name = "codex-buddy";
const locales = [undefined, "en", "ru"] as const;

for (const language_code of locales) {
  await callTelegram("setMyName", withLocale({ name }, language_code));
  await callTelegram("setMyCommands", withLocale({ commands }, language_code));
  await callTelegram("setMyShortDescription", withLocale({ short_description: shortDescription }, language_code));
  await callTelegram("setMyDescription", withLocale({ description }, language_code));
}

console.log(JSON.stringify({ ok: true, commands: commands.length, locales: locales.map((locale) => locale ?? "default") }, null, 2));

function withLocale<T extends Record<string, unknown>>(payload: T, language_code: string | undefined): T & { language_code?: string } {
  return language_code ? { ...payload, language_code } : payload;
}

async function callTelegram(method: string, payload: unknown): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !body.ok) {
    throw new Error(`Telegram ${method} failed: ${body.description ?? response.statusText}`);
  }
}
