export const copy = {
  start:
    "codex-buddy helps real people pair up for the official Codex referral flow.\n\n" +
    "No selling, farming, self-referrals, or automated invite sending. OpenAI rules, eligibility, and rewards depend on the current OpenAI offer; there are no guarantees.\n\n" +
    "The form is short: givers enter only active invite slots, seekers enter only email and fast-action availability.\n\n" +
    "We use email only for the official invite flow: a hash for dedupe and short encrypted storage for one-time relay to the giver.",
  rules:
    "Rules:\n" +
    "1. Real people only, using the official OpenAI Codex flow.\n" +
    "2. No selling, buying, farming, or self-referrals.\n" +
    "3. The bot does not call unofficial OpenAI invite endpoints.\n" +
    "4. Both sides confirm completion after the invitee sends the first Codex message.\n" +
    "5. When the promo window closes, the bot switches to archive mode.",
  help:
    "Commands: /give, /seek, /status, /pause, /resume, /cancel, /confirmed, /rules, /help.\n\n" +
    "If something goes wrong, open /status and cancel your active request or match.",
  privacyConsent:
    "Send the email the giver needs for the official OpenAI invite flow.\n\n" +
    "Consent: the bot stores a masked email, a keyed hash for dedupe, and encrypted email only for a short relay window. Full email is not shown in the admin UI and is not written to logs.",
  archiveDefault:
    "Matching is paused because the current referral wave has ended. Status, rules, and help remain available."
} as const;
