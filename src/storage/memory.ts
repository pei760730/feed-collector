/**
 * 記憶體版 Storage —— 給單元測試與本機 dry-run 用,不碰網路。
 */
import type { Storage, DuplicateHit, StatsSummary } from "./Storage.js";
import type { StagingRow } from "../types.js";
import { STAGING_COLUMNS } from "../types.js";
import { computeStats } from "./computeStats.js";

export interface MemoryStorageOptions {
  approvedUrls?: Iterable<string>;
  approvedUrlColumnAvailable?: boolean;
}

export class MemoryStorage implements Storage {
  private rows: StagingRow[] = [];
  private readonly approvedUrls: Set<string>;
  private readonly approvedUrlColumnAvailable: boolean;

  constructor(seed: StagingRow[] = [], opts: MemoryStorageOptions = {}) {
    this.rows = [...seed];
    this.approvedUrls = new Set(
      [...(opts.approvedUrls ?? [])].map((url) => url.trim()).filter((url) => url !== ""),
    );
    this.approvedUrlColumnAvailable = opts.approvedUrlColumnAvailable ?? true;
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
    const key = cleanUrl.trim();
    if (!key || !this.approvedUrlColumnAvailable) return false;
    return this.approvedUrls.has(key);
  }

  async append(row: StagingRow): Promise<void> {
    this.rows.push(row);
  }

  async stats(opts: { recentLimit: number; nowMs: number }): Promise<StatsSummary> {
    return computeStats(this.rows, opts);
  }

  /** 測試輔助:讀全部列。 */
  all(): StagingRow[] {
    return [...this.rows];
  }
}
