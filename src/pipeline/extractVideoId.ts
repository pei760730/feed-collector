/**
 * Extract Video ID —— 本服務最關鍵的部分(規格 §4.3)。
 *
 * 流程:
 *   步驟 0  解 Facebook 轉址(l.facebook.com/l.php?u=… → decodeURIComponent 還原真網址,回寫 CLEAN_URL)
 *   步驟 1  依 hostname 判斷平台
 *   步驟 2  依平台規則抽出帶前綴的 VIDEO_ID
 *   抓不到 → VIDEO_ID = raw_<timestamp>(代表 unsupported)
 *
 * 純函式,無網路請求。`now` 可注入以利測試(預設 Date.now)。
 */
import type { Platform } from "../types.js";
import { cleanUrl } from "./cleanUrl.js";

export interface ExtractResult {
  platform: Platform;
  /** 帶平台前綴的唯一 ID,如 tt_7234…;抓不到為 raw_<ts>。 */
  videoId: string;
  /** 可能因 FB 轉址而還原過的乾淨網址(回寫進 CLEAN_URL)。 */
  cleanUrl: string;
  /** 抓不到 ID(VIDEO_ID 為 raw_*)。 */
  unsupported: boolean;
}

/** hostname 是否等於或為某網域的子網域(`www.youtube.com` ⊂ `youtube.com`)。 */
function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

interface PlatformRule {
  platform: Platform;
  domains: string[];
}

/** 平台判斷規則(順序即優先序,先命中先贏)。 */
const PLATFORM_RULES: PlatformRule[] = [
  { platform: "Instagram", domains: ["instagram.com"] },
  { platform: "TikTok", domains: ["tiktok.com"] },
  { platform: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { platform: "Facebook", domains: ["facebook.com", "fb.watch", "fb.com"] },
  { platform: "X", domains: ["x.com", "twitter.com"] },
  { platform: "小紅書", domains: ["xiaohongshu.com", "xhslink.com"] },
  { platform: "Threads", domains: ["threads.net", "threads.com"] },
];

function detectPlatform(hostname: string): Platform {
  for (const rule of PLATFORM_RULES) {
    if (rule.domains.some((d) => hostMatches(hostname, d))) return rule.platform;
  }
  return "Other";
}

/** 依序試多個 pattern,回傳第一個命中的「最後一個非空」capture group。 */
function firstMatch(url: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      for (let i = m.length - 1; i >= 1; i--) {
        if (m[i]) return m[i] as string;
      }
    }
  }
  return null;
}

// Task1(2026-06-27):path 型 id pattern 只比對 **host+pathname**(不吃 query),擋
// `?redirect=/video/<n>`、`?ref=/videos/<n>`、`?from=/reel/<code>` 之類 query 注入造假 ID。
// 合法的 query id(YouTube `?v=`、Facebook `story_fbid`/`v`)另以白名單從 searchParams 抽。
const IG_PATTERNS = [/\/(?:reel|reels|tv|p)\/([A-Za-z0-9_-]+)/];
const TIKTOK_PATTERNS = [/\/video\/(\d+)/];
// YouTube path 型形態(shorts/youtu.be/embed/live);watch?v= 走 query 白名單(見 youtubeQueryId)。
// 結尾 (?![A-Za-z0-9_-]) 右邊界:YouTube ID 恰 11 碼,非 11 碼整段不命中 → 落 raw_。
// 補 /live/(2026-06-27 對齊 core/voc/tbvoc canonical)。
const YOUTUBE_PATH_PATTERNS = [
  /shorts\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
  /embed\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
  /\/live\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
  /youtu\.be\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
];
const YOUTUBE_V_ID = /^[A-Za-z0-9_-]{11}$/;
// 小紅書 id 收緊成小寫 hex(真實 id 是 24 碼小寫 hex)。對齊 core/voc/tbvoc 的 [a-f0-9](2026-06-27)。
const XHS_PATTERNS = [/\/(?:explore|discovery\/item)\/([a-f0-9]+)/];
const THREADS_PATTERNS = [/\/post\/([A-Za-z0-9_-]+)/];

/** YouTube watch?v= 走 query 白名單:取 top-level `v`、且恰 11 碼才算。 */
function youtubeQueryId(params: URLSearchParams): string | null {
  const v = params.get("v") ?? "";
  return YOUTUBE_V_ID.test(v) ? v : null;
}

/**
 * Facebook 抽 ID —— 四種形態依序試,各自帶不同前綴。
 *   A. fb.watch/<code>          → fbw_   (host+pathname)
 *   B. /(reel|reels|videos)/<n> → fb_    (host+pathname)
 *   C. /share/[rvp]/<code>      → fbs_   (host+pathname)
 *   D. query story_fbid 或 v    → fb_    (query 白名單)
 */
function extractFacebook(url: URL): string | null {
  const pathPart = `${url.host}${url.pathname}`;
  const fbw = pathPart.match(/fb\.watch\/([A-Za-z0-9_-]+)/);
  if (fbw) return `fbw_${fbw[1]}`;
  const vids = pathPart.match(/\/(?:reel|reels|videos)\/(\d+)/);
  if (vids) return `fb_${vids[1]}`;
  const share = pathPart.match(/\/share\/[rvp]\/([A-Za-z0-9_-]+)/);
  if (share) return `fbs_${share[1]}`;
  const story = url.searchParams.get("story_fbid") ?? url.searchParams.get("v");
  if (story) return `fb_${story}`;
  return null;
}

/** 解 Facebook 轉址:l.facebook.com/l.php?u=… → 還原 + 重新清理。回 null 表非轉址。 */
function unwrapFacebookRedirect(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host !== "l.facebook.com" && host !== "lm.facebook.com") return null;
  const u = url.searchParams.get("u");
  if (!u) return null;
  try {
    return cleanUrl(decodeURIComponent(u));
  } catch {
    return null;
  }
}

export function extractVideoId(
  inputCleanUrl: string,
  now: () => number = Date.now,
): ExtractResult {
  let working = inputCleanUrl ?? "";

  // 步驟 0:解 FB 轉址,還原後回寫 cleanUrl
  let url: URL | null = null;
  try {
    url = new URL(working);
  } catch {
    url = null;
  }
  if (url) {
    const unwrapped = unwrapFacebookRedirect(url);
    if (unwrapped) {
      working = unwrapped;
      try {
        url = new URL(working);
      } catch {
        url = null;
      }
    }
  }

  const raw = (id: string | null, platform: Platform): ExtractResult => {
    if (id) return { platform, videoId: id, cleanUrl: working, unsupported: false };
    return { platform, videoId: `raw_${now()}`, cleanUrl: working, unsupported: true };
  };

  if (!url) return raw(null, "Other");

  const host = url.hostname.toLowerCase();
  const platform = detectPlatform(host);
  // path 型 pattern 只比對 host+pathname(砍 query),擋 query 注入造假 ID。
  const pathPart = `${url.host}${url.pathname}`;

  switch (platform) {
    case "Instagram": {
      const m = firstMatch(pathPart, IG_PATTERNS);
      return raw(m ? `ig_${m}` : null, platform);
    }
    case "TikTok": {
      const m = firstMatch(pathPart, TIKTOK_PATTERNS);
      return raw(m ? `tt_${m}` : null, platform);
    }
    case "YouTube": {
      const m = firstMatch(pathPart, YOUTUBE_PATH_PATTERNS) ?? youtubeQueryId(url.searchParams);
      return raw(m ? `yt_${m}` : null, platform);
    }
    case "Facebook":
      return raw(extractFacebook(url), platform);
    case "X": {
      const m = pathPart.match(/\/status\/(\d+)/);
      return raw(m ? `x_${m[1]}` : null, platform);
    }
    case "小紅書": {
      const m = firstMatch(pathPart, XHS_PATTERNS);
      return raw(m ? `xhs_${m}` : null, platform);
    }
    case "Threads": {
      const m = firstMatch(pathPart, THREADS_PATTERNS);
      return raw(m ? `th_${m}` : null, platform);
    }
    default:
      return raw(null, "Other");
  }
}
