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

const IG_PATTERNS = [/\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/];
const TIKTOK_PATTERNS = [/\/video\/(\d+)/];
// 結尾 (?![A-Za-z0-9_-]) 右邊界:YouTube ID 恰 11 碼。沒邊界時非 11 碼(如 12 碼)
// 會被「靜默吃前 11 碼」造出截斷的錯 ID;有邊界 → 非 11 碼整段不命中 → 正確落 raw_。
const YOUTUBE_PATTERNS = [
  /[?&]v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
  /shorts\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
  /embed\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
  /youtu\.be\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/,
];
const XHS_PATTERNS = [/\/(?:explore|discovery\/item)\/([A-Za-z0-9]+)/];

/**
 * Facebook 抽 ID —— 四種形態依序試,各自帶不同前綴。
 *   A. fb.watch/<code>          → fbw_
 *   B. /(reel|reels|videos)/<n> → fb_
 *   C. /share/[rvp]/<code>      → fbs_
 *   D. query story_fbid 或 v    → fb_
 */
function extractFacebook(url: URL): string | null {
  const full = url.toString();
  const fbw = full.match(/fb\.watch\/([A-Za-z0-9_-]+)/);
  if (fbw) return `fbw_${fbw[1]}`;
  const vids = full.match(/\/(?:reel|reels|videos)\/(\d+)/);
  if (vids) return `fb_${vids[1]}`;
  const share = full.match(/\/share\/[rvp]\/([A-Za-z0-9_-]+)/);
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

  switch (platform) {
    case "Instagram": {
      const m = firstMatch(working, IG_PATTERNS);
      return raw(m ? `ig_${m}` : null, platform);
    }
    case "TikTok": {
      const m = firstMatch(working, TIKTOK_PATTERNS);
      return raw(m ? `tt_${m}` : null, platform);
    }
    case "YouTube": {
      const m = firstMatch(working, YOUTUBE_PATTERNS);
      return raw(m ? `yt_${m}` : null, platform);
    }
    case "Facebook":
      return raw(extractFacebook(url), platform);
    case "X": {
      const m = working.match(/\/status\/(\d+)/);
      return raw(m ? `x_${m[1]}` : null, platform);
    }
    case "小紅書": {
      const m = firstMatch(working, XHS_PATTERNS);
      return raw(m ? `xhs_${m}` : null, platform);
    }
    default:
      return raw(null, "Other");
  }
}
