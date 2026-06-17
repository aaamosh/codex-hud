import { readFileSync } from "node:fs";
import { loadEnv } from "./env";

const env = loadEnv();
if (!env.BUDDY_PUBLIC_BASE_URL) {
  throw new Error("BUDDY_PUBLIC_BASE_URL is required to register Telegram webhook");
}

const webhookUrl = new URL("/telegram/webhook", env.BUDDY_PUBLIC_BASE_URL).toString();
const apiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;

let response: Response;
if (env.TELEGRAM_WEBHOOK_CERT_PATH) {
  const form = new FormData();
  form.set("url", webhookUrl);
  if (env.TELEGRAM_SECRET_TOKEN) form.set("secret_token", env.TELEGRAM_SECRET_TOKEN);
  form.set("drop_pending_updates", "false");
  form.set("certificate", new Blob([readFileSync(env.TELEGRAM_WEBHOOK_CERT_PATH)]), "codex-buddy-webhook.pem");
  response = await fetch(apiUrl, { method: "POST", body: form });
} else {
  response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: env.TELEGRAM_SECRET_TOKEN,
      drop_pending_updates: false
    })
  });
}

const body = (await response.json()) as unknown;
console.log(JSON.stringify({ ok: response.ok, webhookUrl, body }, null, 2));
if (!response.ok) process.exitCode = 1;
