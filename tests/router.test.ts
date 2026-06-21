import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Telegram } from "telegraf";
import type { Update } from "@telegraf/types";
import { createBot } from "../src/bot/router.js";
import { MemoryStorage } from "../src/storage/memory.js";
import type { Storage } from "../src/storage/Storage.js";
import type { Config } from "../src/config.js";

function memoryConfig(): Config {
  return {
    telegramToken: "TEST:TOKEN",
    mode: "polling",
    storage: "memory",
    webhook: { domain: "", path: "/telegraf", port: 8080 },
    google: null, // memory 乾跑:不碰真表
    errorChatId: "",
    expandShortUrls: false,
    logLevel: "info",
  };
}

// telegraf 的 handleUpdate 每筆更新會 new 一個 Telegram 實例,
// 所以攔截點必須在 prototype.callApi(所有實例共用),不能 stub bot.telegram。
const sent: string[] = [];
const origCallApi = Telegram.prototype.callApi;
Telegram.prototype.callApi = async function (method: string, payload?: { text?: string }) {
  if (method === "sendMessage" && payload?.text) sent.push(payload.text);
  return {} as never;
} as typeof Telegram.prototype.callApi;
afterAll(() => {
  Telegram.prototype.callApi = origCallApi;
});
beforeEach(() => {
  sent.length = 0;
});

function makeBot(storage: Storage, hooks?: { onPersistError?: () => void }) {
  const bot = createBot(memoryConfig(), storage, hooks);
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: "bot",
    username: "testbot",
  } as typeof bot.botInfo;
  return bot;
}

function photoWithCaption(caption: string): Update {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      date: 0,
      chat: { id: 123, type: "private", first_name: "Pei" },
      from: { id: 9, is_bot: false, first_name: "Pei" },
      photo: [{ file_id: "f", file_unique_id: "u", width: 1, height: 1 }],
      caption,
    },
  } as unknown as Update;
}

function textMessage(text: string): Update {
  return {
    update_id: 2,
    message: {
      message_id: 11,
      date: 0,
      chat: { id: 123, type: "private", first_name: "Pei" },
      from: { id: 9, is_bot: false, first_name: "Pei" },
      text,
    },
  } as unknown as Update;
}

describe("router caption routing(#2 媒體 caption 不再靜默丟失)", () => {
  it("媒體 caption 裡的連結 → 走 ingest 寫入", async () => {
    const storage = new MemoryStorage();
    const bot = makeBot(storage);

    await bot.handleUpdate(
      photoWithCaption("https://www.tiktok.com/@u/video/7234567890 轉傳的"),
    );

    const all = storage.all();
    expect(all).toHaveLength(1);
    expect(all[0]!.VIDEO_ID).toBe("tt_7234567890");
    expect(sent.some((t) => t.includes("已收進暫存區"))).toBe(true);
  });

  it("媒體 caption 沒有連結 → 回提示、不寫入(有回覆即非靜默)", async () => {
    const storage = new MemoryStorage();
    const bot = makeBot(storage);

    await bot.handleUpdate(photoWithCaption("純粹一張圖沒連結"));

    expect(storage.all()).toHaveLength(0);
    expect(sent.some((t) => t.includes("看不懂"))).toBe(true);
  });
});

describe("router onPersistError 透传(#1 drain 靠它停在 offset)", () => {
  function failingStorage(): Storage {
    return {
      ensureHeader: async () => {},
      findByVideoId: async () => null,
      append: async () => {
        throw new Error("sheet 寫入炸了");
      },
    };
  }

  it("text 訊息寫入失敗 → createBot 傳入的 onPersistError 被呼叫", async () => {
    let persistFailed = false;
    const bot = makeBot(failingStorage(), {
      onPersistError: () => (persistFailed = true),
    });

    await bot.handleUpdate(textMessage("https://www.tiktok.com/@u/video/7234567890"));

    expect(persistFailed).toBe(true);
  });

  it("caption 訊息寫入失敗 → onPersistError 一樣被呼叫", async () => {
    let persistFailed = false;
    const bot = makeBot(failingStorage(), {
      onPersistError: () => (persistFailed = true),
    });

    await bot.handleUpdate(
      photoWithCaption("https://www.tiktok.com/@u/video/7234567890"),
    );

    expect(persistFailed).toBe(true);
  });
});
