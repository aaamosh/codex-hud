import { isValidEmail } from "@codex-hud/core";
import { type D1BuddyRepository } from "@codex-hud/db";
import {
  availabilityKeyboard,
  copy,
  parseCallbackData,
  startKeyboard,
  type TelegramUpdate,
  type TelegramUser
} from "@codex-hud/telegram";
import type { BuddyNodeRuntime } from "./runtime";
import { sendOutbox } from "./runtime";

const DEFAULT_PLAN_TYPE = "pro" as const;
const DEFAULT_MATCH_LANGUAGE = "en";
const DEFAULT_MATCH_REGION = "global";
const DEFAULT_MATCH_TIMEZONE = "any";

export async function handleTelegramUpdate(update: TelegramUpdate, runtime: BuddyNodeRuntime): Promise<void> {
  const sourceUser = update.message?.from ?? update.callback_query?.from;
  if (!sourceUser) return;

  const now = new Date().toISOString();
  const user = await runtime.repo.upsertTelegramUser(toUserInput(sourceUser), now);

  if (update.callback_query) {
    await runtime.telegram.answerCallbackQuery(update.callback_query.id).catch(() => undefined);
    const parsed = parseCallbackData(update.callback_query.data);
    if (!parsed) {
      await runtime.telegram.sendMessage(sourceUser.id, "I did not understand that button. Try /status.");
      return;
    }

    if (parsed.kind === "match") {
      const outbox = await runtime.matchAction({
        matchId: parsed.matchId,
        action: parsed.action,
        actorUserId: user.id,
        actorChatId: user.telegram_user_id
      });
      await sendOutbox(runtime.telegram, outbox, async (message) => {
        if (message.afterSend?.clearSeekerEmailCiphertextId) {
          await runtime.repo.clearSeekerEmailCiphertext(message.afterSend.clearSeekerEmailCiphertextId);
        }
      });
      return;
    }

    await handleSimpleCallback(parsed.action, parsed.value, { repo: runtime.repo, runtime, user });
    return;
  }

  const message = update.message;
  const text = message?.text?.trim();
  if (!message || !text) return;
  if (text.startsWith("/")) {
    await handleCommand(text, { repo: runtime.repo, runtime, user });
    return;
  }

  const conversation = await runtime.repo.getConversation(user.id);
  if (!conversation) {
    await runtime.telegram.sendMessage(message.chat.id, "Send /give or /seek to start.");
    return;
  }

  if (conversation.flow === "give") {
    await advanceGiveConversation(text, { repo: runtime.repo, runtime, user });
    return;
  }
  if (conversation.flow === "seek") {
    await advanceSeekConversation(text, { repo: runtime.repo, runtime, user });
  }
}

interface HandlerContext {
  repo: D1BuddyRepository;
  runtime: BuddyNodeRuntime;
  user: Awaited<ReturnType<D1BuddyRepository["upsertTelegramUser"]>>;
}

async function handleCommand(commandText: string, context: HandlerContext): Promise<void> {
  const command = commandText.split(/\s+/)[0]?.toLowerCase();
  switch (command) {
    case "/start":
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, copy.start, { replyMarkup: startKeyboard() });
      return;
    case "/give":
      await startGive(context);
      return;
    case "/seek":
      await startSeek(context);
      return;
    case "/status":
      await sendStatus(context);
      return;
    case "/pause":
      {
        const changed = await context.repo.updateGiverOfferStateForUser(context.user.id, ["active"], "paused");
        await context.runtime.telegram.sendMessage(
          context.user.telegram_user_id,
          changed > 0 ? "Active offers are paused." : "There are no active offers to pause."
        );
      }
      return;
    case "/resume":
      {
        const changed = await context.repo.updateGiverOfferStateForUser(context.user.id, ["paused"], "active");
        await context.runtime.telegram.sendMessage(
          context.user.telegram_user_id,
          changed > 0 ? "Pause removed. Offers are active again." : "There are no paused offers right now."
        );
      }
      return;
    case "/cancel":
      {
        const seekerChanges = await context.repo.cancelActiveSeekerRequestsForUser(context.user.id);
        const offerChanges = await context.repo.updateGiverOfferStateForUser(context.user.id, ["active", "paused", "reserved"], "cancelled");
        await context.repo.clearConversation(context.user.id);
        await context.runtime.telegram.sendMessage(
          context.user.telegram_user_id,
          seekerChanges + offerChanges > 0 ? "Active requests and offers were cancelled." : "There were no active requests or offers."
        );
      }
      return;
    case "/confirmed":
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "Use the buttons inside the current match to confirm. If the buttons are gone, open /status.");
      return;
    case "/rules":
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, copy.rules);
      return;
    case "/help":
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, copy.help);
      return;
    case "/admin":
      await sendAdminHint(context);
      return;
    default:
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "Unknown command. /help shows available actions.");
  }
}

async function handleSimpleCallback(action: string, value: string | undefined, context: HandlerContext): Promise<void> {
  switch (action) {
    case "give":
      await startGive(context);
      return;
    case "seek":
      await startSeek(context);
      return;
    case "status":
      await sendStatus(context);
      return;
    case "rules":
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, copy.rules);
      return;
    case "help":
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, copy.help);
      return;
    case "give_plan":
      await context.repo.setConversation(context.user.id, { flow: "give", step: "capacity", data: {} }, new Date().toISOString());
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "The form is shorter now. How many active invite slots do you want to offer?");
      return;
    case "seek_availability":
      await finishSeekConversation(Number(value ?? 60), context);
      return;
    default:
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "That button is stale. Try /status.");
  }
}

async function startGive(context: HandlerContext): Promise<void> {
  await context.repo.setConversation(context.user.id, { flow: "give", step: "capacity", data: {} }, new Date().toISOString());
  await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "How many active invite slots do you want to offer? For example: 1 or 3.");
}

async function startSeek(context: HandlerContext): Promise<void> {
  await context.repo.setConversation(context.user.id, { flow: "seek", step: "email", data: {} }, new Date().toISOString());
  await context.runtime.telegram.sendMessage(context.user.telegram_user_id, copy.privacyConsent);
}

async function advanceGiveConversation(text: string, context: HandlerContext): Promise<void> {
  const conversation = await context.repo.getConversation(context.user.id);
  if (!conversation) return;
  const data = { ...conversation.data } as Record<string, unknown>;

  if (["plan", "language", "region", "timezone"].includes(conversation.step)) {
    await context.repo.setConversation(context.user.id, { flow: "give", step: "capacity", data }, new Date().toISOString());
    await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "The form is shorter now. How many active invite slots do you want to offer?");
    return;
  }
  if (conversation.step === "capacity") {
    const result = await context.runtime.service.createGiverOffer({
      user: context.user,
      planType: DEFAULT_PLAN_TYPE,
      language: DEFAULT_MATCH_LANGUAGE,
      region: DEFAULT_MATCH_REGION,
      timezone: DEFAULT_MATCH_TIMEZONE,
      capacityRequested: Number(text)
    });
    await context.repo.clearConversation(context.user.id);
    if (!result.ok) {
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, result.message);
      return;
    }
    await context.runtime.telegram.sendMessage(
      context.user.telegram_user_id,
      `Offer active: slots ${result.value.capacity_active}/${result.value.capacity_total}.\n\n` +
        `Commands: /pause, /resume, /cancel, /status.`
    );
    await sendOutbox(context.runtime.telegram, await context.runtime.attemptPendingMatches());
  }
}

async function advanceSeekConversation(text: string, context: HandlerContext): Promise<void> {
  const conversation = await context.repo.getConversation(context.user.id);
  if (!conversation) return;
  const data = { ...conversation.data } as Record<string, unknown>;

  if (["language", "region", "timezone"].includes(conversation.step)) {
    await context.repo.setConversation(context.user.id, { flow: "seek", step: "email", data }, new Date().toISOString());
    await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "The form is shorter now: language and region are no longer needed.");
    await context.runtime.telegram.sendMessage(context.user.telegram_user_id, copy.privacyConsent);
    return;
  }
  if (conversation.step === "email") {
    if (!isValidEmail(text)) {
      await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "That does not look like an email. Check the format and send it again.");
      return;
    }
    data.email = text;
    await context.repo.setConversation(context.user.id, { flow: "seek", step: "availability", data }, new Date().toISOString());
    await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "Can you act quickly after a match?", { replyMarkup: availabilityKeyboard() });
    return;
  }
  if (conversation.step === "availability") {
    await finishSeekConversation(Number(text), context);
  }
}

async function finishSeekConversation(availabilityWindowMinutes: number, context: HandlerContext): Promise<void> {
  const conversation = await context.repo.getConversation(context.user.id);
  if (!conversation || conversation.flow !== "seek") {
    await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "Start a request with /seek.");
    return;
  }
  const data = conversation.data as Record<string, unknown>;
  if (!data.email) {
    await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "The request is incomplete. Start again with /seek.");
    await context.repo.clearConversation(context.user.id);
    return;
  }
  const result = await context.runtime.service.createSeekerRequest({
    user: context.user,
    language: DEFAULT_MATCH_LANGUAGE,
    region: DEFAULT_MATCH_REGION,
    timezone: DEFAULT_MATCH_TIMEZONE,
    email: String(data.email),
    availabilityWindowMinutes: Number.isFinite(availabilityWindowMinutes) ? availabilityWindowMinutes : 60
  });
  await context.repo.clearConversation(context.user.id);
  if (!result.ok) {
    await context.runtime.telegram.sendMessage(context.user.telegram_user_id, result.message);
    return;
  }
  await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "Request created. Looking for a match.");
  await sendOutbox(context.runtime.telegram, await context.runtime.attemptMatch(result.value.id));
}

async function sendStatus(context: HandlerContext): Promise<void> {
  const offers = await context.repo.listUserGiverOffers(context.user.id);
  const requests = await context.repo.listUserSeekerRequests(context.user.id);
  const activeOffers = offers
    .filter((offer) => ["active", "paused", "reserved", "exhausted"].includes(offer.state))
    .slice(0, 5);
  const activeRequests = requests
    .filter((request) => ["pending", "reserved", "matched"].includes(request.state))
    .slice(0, 5);
  const offerLines = activeOffers.map((offer) => `giver: ${offer.state}, slots ${offer.capacity_active}/${offer.capacity_total}`);
  const requestLines = activeRequests.map((request) => `seeker: ${request.state}, ${request.email_masked}`);
  const notes = activeOffers.length > 0 && activeRequests.length > 0
    ? ["Note: your own seeker request cannot match your own giver offer. Self-referrals are blocked; another Telegram user is needed."]
    : [];
  const body = [...offerLines, ...requestLines, ...notes].join("\n") || "No active records yet.";
  await context.runtime.telegram.sendMessage(context.user.telegram_user_id, body);
}

async function sendAdminHint(context: HandlerContext): Promise<void> {
  const allowed = (context.runtime.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!allowed.includes(context.user.telegram_user_id)) {
    await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "Admin access is not configured for this Telegram ID.");
    return;
  }
  await context.runtime.telegram.sendMessage(context.user.telegram_user_id, "Admin surface: open the operator-configured `/admin` URL and use ADMIN_TOKEN as the Bearer token.");
}

function toUserInput(user: TelegramUser): {
  telegram_user_id: string;
  username: string | null;
  first_name: string | null;
  locale: string | null;
} {
  return {
    telegram_user_id: String(user.id),
    username: user.username ?? null,
    first_name: user.first_name ?? null,
    locale: user.language_code ?? null
  };
}
