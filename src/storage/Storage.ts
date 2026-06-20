/**
 * Storage interface —— bot 只認這份介面,不認 Google Sheets。
 * 換儲存來源(DB / 別的試算表)只需新增一個實作,handlers 不用動。
 */
import type { StagingRow } from "../types.js";

export interface DuplicateHit {
  row: StagingRow;
  /** 在 sheet 的列號(1-based,含表頭)。 */
  rowNumber: number;
}

export interface Storage {
  /** 確保分頁 + 表頭存在且與 schema 一致(冪等)。 */
  ensureHeader(): Promise<void>;

  /** 依 VIDEO_ID 找重複,回第一筆 match(含列號),無則 null。 */
  findByVideoId(videoId: string): Promise<DuplicateHit | null>;

  /** append 一列。 */
  append(row: StagingRow): Promise<void>;
}
