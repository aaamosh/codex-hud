import type { InlineKeyboardMarkup } from "./types";
import { matchCallback, simpleCallback } from "./callbacks";

export function startKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "I can give invites", callback_data: simpleCallback("give") }],
      [{ text: "I am looking for an invite", callback_data: simpleCallback("seek") }],
      [
        { text: "My status", callback_data: simpleCallback("status") },
        { text: "Rules", callback_data: simpleCallback("rules") }
      ],
      [{ text: "Help", callback_data: simpleCallback("help") }]
    ]
  };
}

export function planKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Plus", callback_data: simpleCallback("give_plan", "plus") },
        { text: "Pro", callback_data: simpleCallback("give_plan", "pro") }
      ]
    ]
  };
}

export function availabilityKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "30 min", callback_data: simpleCallback("seek_availability", "30") },
        { text: "60 min", callback_data: simpleCallback("seek_availability", "60") },
        { text: "120 min", callback_data: simpleCallback("seek_availability", "120") }
      ]
    ]
  };
}

export function giverMatchKeyboard(matchId: string, emailCiphertextAvailable: boolean): InlineKeyboardMarkup {
  const firstRow = emailCiphertextAvailable
    ? [{ text: "Show email", callback_data: matchCallback("rel", matchId) }]
    : [];
  return {
    inline_keyboard: [
      firstRow,
      [{ text: "Invite sent", callback_data: matchCallback("gs", matchId) }],
      [
        { text: "Cannot do it", callback_data: matchCallback("gcannot", matchId) },
        { text: "Cancel", callback_data: matchCallback("cancel", matchId) }
      ]
    ].filter((row) => row.length > 0)
  };
}

export function seekerMatchKeyboard(matchId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Invite received", callback_data: matchCallback("sr", matchId) }],
      [
        { text: "Did not receive", callback_data: matchCallback("snr", matchId) },
        { text: "Cancel", callback_data: matchCallback("cancel", matchId) }
      ]
    ]
  };
}

export function seekerFinalKeyboard(matchId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Accepted and sent first message", callback_data: matchCallback("sdone", matchId) }],
      [{ text: "Cancel", callback_data: matchCallback("cancel", matchId) }]
    ]
  };
}
