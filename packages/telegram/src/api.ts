import type { InlineKeyboardMarkup, TelegramApiResponse } from "./types";

export interface SendMessageOptions {
  replyMarkup?: InlineKeyboardMarkup;
  disableWebPagePreview?: boolean;
}

export class TelegramClient {
  constructor(private readonly token: string) {}

  async sendMessage(chatId: string | number, text: string, options: SendMessageOptions = {}): Promise<void> {
    await this.call("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: options.disableWebPagePreview ?? true,
      reply_markup: options.replyMarkup
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text
    });
  }

  private async call<T>(method: string, payload: unknown): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram ${method} failed: ${body.description ?? response.statusText}`);
    }
    return body.result as T;
  }
}

