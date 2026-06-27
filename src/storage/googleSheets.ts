/**
 * Google Sheets 版 Storage。
 * - 最小權限:只用 spreadsheets scope。
 * - 寫入一律 RAW(避免 video ID / 開頭 0 被當數字)。
 * - 空表才寫正規表頭;非空 → 不覆寫(避免毀資料)。
 * - ERROR_MSG / WORKER_RUN 留給下游 worker;本服務 append 時填空字串、不覆寫既有列。
 *
 * 表頭飄移防護(2026-06-26):欄位對映改「依實際表頭具名解析」,不再假設固定欄序。
 * 表頭被重排、前面多一欄、後面有空欄,都能把值寫到正確的具名欄、讀回也對得上,而不是因為
 * 「順序/長度不完全相等」就把整輪 drain 打掛。唯一仍 fail-fast = 某個必要欄整個不存在
 * (那才會錯欄毀資料,寧可停下等人對齊)。`findApprovedByUrl` 早已是具名解析,本次對齊其餘讀寫。
 */
import { google, type sheets_v4 } from "googleapis";
// 退避重試(只對暫態錯誤:429/5xx + 網路型)抽進 collector-core,三 collector 共用同一份。
import { withRetry } from "@pei760730/collector-core";
import type { Storage, DuplicateHit, StatsSummary } from "./Storage.js";
import type { StagingRow } from "../types.js";
import { STAGING_COLUMNS } from "../types.js";
import { computeStats } from "./computeStats.js";
import { logger } from "../utils/logger.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export interface GoogleSheetsOptions {
  credentials: { client_email: string; private_key: string };
  sheetId: string;
  sheetName: string;
  prodSheetName: string;
}

/** 表頭解析結果:每個必要欄的 0-based 欄位索引 + 整列寬度。 */
export interface HeaderLayout {
  indexOf: Record<string, number>;
  width: number;
}

/** 0-based 欄索引 → A1 欄字母(0→A, 25→Z, 26→AA)。 */
export function colLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * 依「實際表頭」解析每個必要欄的 0-based 索引(純函式,好測)。
 * 必要欄整個缺席 → 丟錯(不錯欄寫入、不默默毀資料);順序/多餘空欄/前置欄都容忍。
 */
export function resolveHeaderIndexes(
  header: readonly unknown[],
  required: readonly string[],
  label: string,
): HeaderLayout {
  const cells = header.map((h) => String(h ?? "").trim());
  const indexOf: Record<string, number> = {};
  const missing: string[] = [];
  for (const col of required) {
    const idx = cells.indexOf(col);
    if (idx < 0) missing.push(col);
    else indexOf[col] = idx;
  }
  if (missing.length > 0) {
    throw new Error(
      `${label}表頭缺少必要欄 [${missing.join(",")}],拒絕寫入(避免錯欄毀資料)。` +
        `現有=[${cells.join(",")}] 需要=[${required.join(",")}]。請人工對齊表頭。`,
    );
  }
  return { indexOf, width: Math.max(cells.length, required.length) };
}

/** 把一列物件依解析索引排成整列寬度字串陣列(該欄外留空)。 */
export function placeRow(
  row: Record<string, unknown>,
  columns: readonly string[],
  layout: HeaderLayout,
): string[] {
  const cells: string[] = new Array<string>(layout.width).fill("");
  for (const col of columns) {
    const idx = layout.indexOf[col];
    if (idx === undefined) continue; // resolve 階段已保證存在;防禦性
    cells[idx] = String(row[col] ?? "");
  }
  return cells;
}

/** 反向:依解析索引,把實際列的 cell 取回具名欄物件。 */
export function readNamedRow(
  cells: readonly string[],
  columns: readonly string[],
  layout: HeaderLayout,
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const col of columns) {
    const idx = layout.indexOf[col];
    obj[col] = idx === undefined ? "" : String(cells[idx] ?? "");
  }
  return obj;
}

const LAST_COL = colLetter(STAGING_COLUMNS.length - 1);
const PROD_URL_HEADER = "影片連結";

export class GoogleSheetsStorage implements Storage {
  private sheets: sheets_v4.Sheets;
  private readonly sheetId: string;
  private readonly sheetName: string;
  private readonly prodSheetName: string;
  private layoutCache?: HeaderLayout;

  constructor(opts: GoogleSheetsOptions) {
    this.sheetId = opts.sheetId;
    this.sheetName = opts.sheetName;
    this.prodSheetName = opts.prodSheetName;
    const auth = new google.auth.JWT({
      email: opts.credentials.client_email,
      key: opts.credentials.private_key,
      scopes: SCOPES,
    });
    this.sheets = google.sheets({ version: "v4", auth });
  }

  /** `'暫存區'!A1:G1` 之類的 range,中文分頁名要加引號。 */
  private range(a1: string): string {
    return `'${this.sheetName}'!${a1}`;
  }

  private prodRange(a1: string): string {
    return `'${this.prodSheetName}'!${a1}`;
  }

  /**
   * 確認分頁存在,不存在就 fail-fast(不自動建)。
   * 自動建分頁會在 GOOGLE_SHEET_ID / STAGING_SHEET_NAME 設錯時,於錯誤試算表靜默生出空分頁,
   * chat-only owner 永遠不會發現。寧可大聲報錯(collect.yml 的 if:failure() 會 Telegram 通知)。
   */
  private async ensureTab(): Promise<void> {
    const meta = await withRetry("取分頁清單", () =>
      this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId,
        fields: "sheets.properties.title",
      }),
    );
    const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title);
    if (titles.includes(this.sheetName)) return;
    throw new Error(
      `分頁「${this.sheetName}」不存在 — 請確認 GOOGLE_SHEET_ID / STAGING_SHEET_NAME。` +
        `(本服務不自動建分頁,避免在錯誤試算表靜默建空表。)`,
    );
  }

  async ensureHeader(): Promise<void> {
    await this.ensureTab();
    const res = await withRetry("讀表頭", () =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: this.range("1:1"),
      }),
    );
    const header = res.data.values?.[0] ?? [];

    if (header.length === 0) {
      // 空表:寫入正規 schema 表頭(本服務唯一會動表頭的情形)。
      const expected = STAGING_COLUMNS as string[];
      await withRetry("寫表頭", () =>
        this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: this.range(`A1:${LAST_COL}1`),
          valueInputOption: "RAW",
          requestBody: { values: [expected] },
        }),
      );
      this.layoutCache = resolveHeaderIndexes(expected, STAGING_COLUMNS, "暫存區");
      return;
    }

    // 非空:依實際表頭具名解析。必要欄齊全就放行(容忍重排/多欄/空欄);缺欄才 fail-fast。
    this.layoutCache = resolveHeaderIndexes(header, STAGING_COLUMNS, "暫存區");
  }

  /** 讀「實際表頭」並解析具名欄索引(每實例快取一次;委派給 ensureHeader 處理空表)。 */
  private async layout(): Promise<HeaderLayout> {
    if (this.layoutCache) return this.layoutCache;
    await this.ensureHeader();
    return this.layoutCache!;
  }

  /** 讀原始 values(A2 起),回 [實體列號, 該列字串陣列]。空白列跳過但列號仍正確。 */
  private async rawRows(layout: HeaderLayout): Promise<{ rowNumber: number; cells: string[] }[]> {
    const res = await withRetry("讀資料", () =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: this.range(`A2:${colLetter(layout.width - 1)}`),
      }),
    );
    const values = res.data.values ?? [];
    const out: { rowNumber: number; cells: string[] }[] = [];
    for (let i = 0; i < values.length; i++) {
      const cells = values[i]!.map((c) => String(c ?? ""));
      if (!cells.some((c) => c.trim() !== "")) continue;
      out.push({ rowNumber: i + 2, cells }); // +2:表頭 + 1-based
    }
    return out;
  }

  async findByVideoId(videoId: string): Promise<DuplicateHit | null> {
    const key = videoId.trim();
    if (!key) return null; // 空 key 不去重
    const layout = await this.layout();
    for (const { rowNumber, cells } of await this.rawRows(layout)) {
      const row = readNamedRow(cells, STAGING_COLUMNS, layout) as unknown as StagingRow;
      if (row.VIDEO_ID.trim() === key) return { row, rowNumber };
    }
    return null;
  }

  async findApprovedByUrl(cleanUrl: string): Promise<boolean> {
    const key = cleanUrl.trim();
    if (!key) return false;

    let header: string[];
    try {
      const res = await withRetry("讀總表表頭", () =>
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.sheetId,
          range: this.prodRange("1:1"),
        }),
      );
      header = (res.data.values?.[0] ?? []).map((cell) => String(cell ?? "").trim());
    } catch (err) {
      logger.warn(`總表去重跳過:無法讀取分頁 ${this.prodSheetName}`, err);
      return false;
    }

    const urlColIndex = header.findIndex((cell) => cell === PROD_URL_HEADER);
    if (urlColIndex < 0) {
      logger.warn(`總表去重跳過:${this.prodSheetName} 找不到「${PROD_URL_HEADER}」欄`);
      return false;
    }

    const urlCol = colLetter(urlColIndex);
    try {
      const res = await withRetry("讀總表影片連結", () =>
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.sheetId,
          range: this.prodRange(`${urlCol}2:${urlCol}`),
        }),
      );
      const values = res.data.values ?? [];
      return values.some((row) => String(row?.[0] ?? "").trim() === key);
    } catch (err) {
      logger.warn(`總表去重跳過:無法讀取 ${this.prodSheetName} 的「${PROD_URL_HEADER}」欄`, err);
      return false;
    }
  }

  async stats(opts: { recentLimit: number; nowMs: number }): Promise<StatsSummary> {
    const layout = await this.layout();
    const rows = (await this.rawRows(layout)).map(
      ({ cells }) => readNamedRow(cells, STAGING_COLUMNS, layout) as unknown as StagingRow,
    );
    return computeStats(rows, opts);
  }

  async append(row: StagingRow): Promise<void> {
    const layout = await this.layout();
    await withRetry("append", () =>
      this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: this.range(`A1:${colLetter(layout.width - 1)}`),
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [placeRow(row as unknown as Record<string, unknown>, STAGING_COLUMNS, layout)] },
      }),
    );
  }
}
