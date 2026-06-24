/**
 * 共用型別 + Google Sheet「暫存區」schema(SSOT)。
 * 改欄位只改這裡;storage / messages / handlers 都引用這份。
 *
 * 與姊妹專案 short-video-bot 的差異:
 * - 7 欄(不含 SENDER / NOTE / AGE / icon),含下游 worker 用的 ERROR_MSG / WORKER_RUN。
 * - STATUS 只有 pending_review / unsupported(狀態流程,給下游 worker 接手)。
 * - 平台前綴 tt_(非 tiktok_),抓不到為 raw_<ts>。
 */

/** 支援平台(寫進 PLATFORM 欄的顯示名)。 */
export type Platform =
  | "Instagram"
  | "TikTok"
  | "YouTube"
  | "Facebook"
  | "X"
  | "小紅書"
  | "Threads"
  | "Other";

/**
 * STATUS 取值:
 * - pending_review:新、可解析,待下游 worker 處理。
 * - unsupported:無法解析(VIDEO_ID 為 raw_*),待人工看。
 */
export const STATUS = {
  PENDING_REVIEW: "pending_review",
  UNSUPPORTED: "unsupported",
} as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

/**
 * 「暫存區」一列 —— 欄位順序即 Sheet 表頭順序,不要改順序。
 * ERROR_MSG / WORKER_RUN 保留給下游 worker,本服務 append 時一律留空、不覆寫。
 */
export interface StagingRow {
  PLATFORM: string;
  DATE: string; // YYYY/M/D (Asia/Taipei)
  CLEAN_URL: string;
  VIDEO_ID: string;
  STATUS: string; // pending_review | unsupported
  ERROR_MSG: string; // 下游 worker 用,本服務留空
  WORKER_RUN: string; // 下游 worker 用,本服務留空
}

/** 「暫存區」表頭順序(SSOT)。 */
export const STAGING_COLUMNS: (keyof StagingRow)[] = [
  "PLATFORM",
  "DATE",
  "CLEAN_URL",
  "VIDEO_ID",
  "STATUS",
  "ERROR_MSG",
  "WORKER_RUN",
];
