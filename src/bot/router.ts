/**
 * Telegraf 指令路由 —— 把訊息對到 handler,集中錯誤處理。
 */
import { Telegraf, type Context } from "telegraf";
import { message } from "telegraf/filters";
import type { Config } from "../config.js";
import type { Storage } from "../storage/Storage.js";
import { runIngest } from "./handlers/ingest.js";
import { logger } from "../utils/logger.js";

export function createBot(config: Config, storage: Storage): Telegraf {
  const bot = new Telegraf(config.telegramToken);

  const notifyError = async (text: string) => {
    if (!config.errorChatId) return;
    try {
      await bot.telegram.sendMessage(config.errorChatId, `🐞 ${text}`);
    } catch (e) {
      logger.error("通知 error chat 失敗", e);
    }
  };

  bot.start((ctx) => ctx.reply("貼一則含影片連結的訊息,我就幫你收進暫存區。"));
  bot.help((ctx) =>
    ctx.reply("貼影片連結即收錄。支援:Instagram / TikTok / YouTube / Facebook / X / 小紅書。"),
  );

  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    // 未知指令(以 / 開頭但沒對到)→ 提示,不要當連結處理
    if (text.startsWith("/")) {
      return ctx.reply("不認得這個指令。直接貼影片連結即可。");
    }
    try {
      const result = await runIngest(
        { text },
        { storage, expandShortUrls: config.expandShortUrls },
      );
      await ctx.reply(result.reply);
      if (result.error) await notifyError(result.error);
    } catch (err) {
      logger.error("ingest 例外", err);
      await ctx.reply("❌ 處理時發生未預期錯誤。");
      await notifyError(`ingest 例外:${errText(err)}`);
    }
  });

  bot.catch((err, ctx: Context) => {
    logger.error(`Telegraf 未捕捉錯誤 (update ${ctx.updateType})`, err);
  });

  return bot;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
