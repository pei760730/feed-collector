/**
 * 訊息模板 —— 一律純文字(不用 MarkdownV2)。
 * 改進 #2:n8n 版用 MarkdownV2 但沒跳脫,含 . - ( ) 會發送失敗;純文字最穩。
 */
import type { StagingRow } from "../types.js";

export function formatErrorMsg(): string {
  return [
    "⚠️ 看不懂這則訊息,沒有抓到網址。",
    "",
    "請貼一則含影片連結的訊息,例如:",
    "https://www.instagram.com/reel/CxYz123",
    "",
    "支援:Instagram / TikTok / YouTube / Facebook / X / 小紅書 / Threads",
  ].join("\n");
}

/** 新收錄(pending_review)成功。 */
export function savedMsg(row: StagingRow): string {
  return [
    "✅ 已收進暫存區,待處理。",
    `平台:${row.PLATFORM}`,
    `VIDEO_ID:${row.VIDEO_ID}`,
    `狀態:${row.STATUS}`,
    `日期:${row.DATE}`,
  ].join("\n");
}

/** 無法解析(unsupported)但仍存檔。 */
export function unsupportedMsg(row: StagingRow): string {
  return [
    "⚠️ 這個連結抓不到 video ID,已以 unsupported 收錄(待人工看)。",
    `平台:${row.PLATFORM}`,
    `連結:${row.CLEAN_URL}`,
    `狀態:${row.STATUS}`,
  ].join("\n");
}

export function duplicateMsg(existing: StagingRow): string {
  return [
    "♻️ 這支已經存在(暫存區),跳過,沒有重複寫入。",
    `VIDEO_ID:${existing.VIDEO_ID}`,
    `首次日期:${existing.DATE}`,
  ].join("\n");
}

export function approvedDuplicateMsg(cleanUrl: string): string {
  return [
    "♻️ 這支已經存在(總表/待拍池),跳過,沒有寫回暫存區。",
    `連結:${cleanUrl}`,
  ].join("\n");
}

export function saveErrorMsg(detail: string): string {
  return ["❌ 寫入失敗,沒有存進暫存區。", `原因:${detail}`].join("\n");
}
