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
  // Facebook 分享 / 轉址追蹤碼(任何 host 砍都安全,FB 專用)
  "mibextid",
  "rdid",
]);

/** 行動版 → 桌面版 host 對照(正規化 dedup:同片行動/桌面版收斂成同一 clean_url)。 */
const MOBILE_TO_DESKTOP: Record<string, string> = {
  "m.tiktok.com": "www.tiktok.com",
  "m.facebook.com": "www.facebook.com",
  "m.youtube.com": "www.youtube.com",
  "mobile.twitter.com": "twitter.com",
};

/**
 * 已知短網址服務 host(供 ingest 決定要不要展開;與 collector-core 那份必須一致)。
 * 2026-06-27 補台/中常見分享短鏈(實測會 302 到目標):reurl.cc/pse.is/lihi*.cc/s.id/
 * tiny.cc/rb.gy/cutt.ly,並補 v.douyin.com / short.link 對齊 core。
 * 刻意不收:forms.gle(Google 表單)、a.co(Amazon)—— 非影片分享。
 */
const SHORT_URL_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "tiny.cc",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "t.co",
  "short.link",
  "cutt.ly",
  "rb.gy",
  "s.id",
  "reurl.cc",
  "pse.is",
  "pros.is",
  "lihi.cc",
  "lihi1.cc",
  "lihi2.cc",
  "lihi3.cc",
  "lihi.io",
  "lihi.biz",
  "lihi.tv",
  "myppt.cc",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "v.douyin.com",
  "xhslink.com",
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

  // 行動版轉桌面版(在去追蹤參數前先正規化 host)
  const desktopHost = MOBILE_TO_DESKTOP[url.hostname.toLowerCase()];
  if (desktopHost) {
    url.hostname = desktopHost;
  }

  // twitter/x 的 `t` 是分享追蹤碼;但 `t` 在 YouTube 是影片起始秒數(?t=30s),
  // 故僅對 x/twitter host 砍,不放進全域 TRACKING_PARAMS(避免弄丟 YT 時間戳)。
  const host = url.hostname.toLowerCase();
  if (host === "x.com" || host === "twitter.com") {
    url.searchParams.delete("t");
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
