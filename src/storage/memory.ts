/**
 * 記憶體版 Storage —— 給單元測試與本機 dry-run 用,不碰網路。
 */
import type { Storage, DuplicateHit } from "./Storage.js";
import type { StagingRow } from "../types.js";
import { STAGING_COLUMNS } from "../types.js";

export interface MemoryStorageOptions {
  approvedUrls?: Iterable<string>;
  approvedLookupAvailable?: boolean;
}

export class MemoryStorage implements Storage {
  private rows: StagingRow[] = [];
  private approvedUrls: Set<string>;
  private approvedLookupAvailable: boolean;

  constructor(seed: StagingRow[] = [], opts: MemoryStorageOptions = {}) {
    this.rows = [...seed];
    this.approvedUrls = new Set(
      [...(opts.approvedUrls ?? [])].map((url) => url.trim()).filter((url) => url !== ""),
    );
    this.approvedLookupAvailable = opts.approvedLookupAvailable ?? true;
  }

  async ensureHeader(): Promise<void> {
    void STAGING_COLUMNS; // 記憶體版固定 schema,無需建表頭
  }

  async findByVideoId(videoId: string): Promise<DuplicateHit | null> {
    const key = videoId.trim();
    if (!key) return null; // 空 key 不去重
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i]!;
      if (r.VIDEO_ID.trim() === key) return { row: r, rowNumber: i + 2 };
    }
    return null;
  }

  async findApprovedByUrl(cleanUrl: string): Promise<boolean> {
    if (!this.approvedLookupAvailable) return false;
    const key = cleanUrl.trim();
    return key !== "" && this.approvedUrls.has(key);
  }

  async append(row: StagingRow): Promise<void> {
    this.rows.push(row);
  }

  addApprovedUrl(cleanUrl: string): void {
    const key = cleanUrl.trim();
    if (key) this.approvedUrls.add(key);
  }

  /** 測試輔助:讀全部列。 */
  all(): StagingRow[] {
    return [...this.rows];
  }
}
