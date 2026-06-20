/**
 * Clean URL —— 移除追蹤參數、清 hash、去尾斜線。
 * 純函式(不發網路請求);短網址展開另外用 expandShortUrl(opt-in)。
 */

/** 要移除的追蹤參數(規格 §4.2)。 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "igshid",
  "igsh",
  // Threads / Meta 分享追蹤碼(不清會污染 dedup key,同片不同分享碼算成兩筆)
  "xmt",
  "slof",
  "tt_from",
  "s",
]);

/** 已知短網址服務 host(供 ingest 決定要不要展開)。 */
const SHORT_URL_HOSTS = new Set([
  "vm.tiktok.com",
  "vt.tiktok.com",
  "xhslink.com",
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "t.co",
]);

/** 是否為已知短網址服務。 */
export function hasShortHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SHORT_URL_HOSTS.has(host);
}

/**
 * 清理網址。解析失敗(非合法 URL)時退回字串層級清理,盡量不丟資料。
 * fallback:取 `?` 前段、去尾斜線(規格 §4.2)。
 */
export function cleanUrl(input: string): string {
  let raw = (input ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // 不是合法 URL → 取 ? 前段、去尾斜線
    return raw.split("?")[0]!.replace(/\/+$/, "");
  }

  // 移除追蹤參數
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  // 清 hash
  url.hash = "";

  return stringCleanup(url.toString());
}

/** 字串層級清理:去尾斜線、修 `?&`、合併多 `&`、去尾端孤立 ? / &。 */
function stringCleanup(s: string): string {
  let out = s;
  out = out.replace(/\?&/g, "?");
  out = out.replace(/&{2,}/g, "&");
  out = out.replace(/[?&]+$/g, "");
  out = out.replace(/\/(\?)/g, "$1");
  out = out.replace(/\/+$/, "");
  return out;
}
