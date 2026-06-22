/**
 * /stats handler —— 暫存區彙總(純文字,不依賴 Telegraf,好測試)。
 * 總筆數 + 各平台 + 各狀態 + 本週/本月新增 + 最近 N 筆。
 */
import type { Storage } from "../../storage/Storage.js";

const PLATFORM_ICON: Record<string, string> = {
  Instagram: "📸",
  TikTok: "🎵",
  YouTube: "▶️",
  Facebook: "📘",
  X: "✖️",
  小紅書: "📕",
  Threads: "🧵",
  Other: "🔗",
};

export interface StatsDeps {
  storage: Storage;
  recentLimit?: number;
  now?: () => number;
}

export async function runStats(deps: StatsDeps): Promise<string> {
  const recentLimit = deps.recentLimit ?? 5;
  const nowMs = (deps.now ?? Date.now)();
  const s = await deps.storage.stats({ recentLimit, nowMs });

  if (s.total === 0) {
    return "📊 暫存區目前是空的。";
  }

  // 限筆數,避免亂資料把分類撐爆(Telegram 單則 4096 字上限)。
  const capList = (obj: Record<string, number>, max = 15) => {
    const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const head = entries.slice(0, max).map(([k, n]) => `  ${k}:${n}`);
    if (entries.length > max) head.push(`  …(其餘 ${entries.length - max} 類)`);
    return head;
  };

  const platformLines = capList(s.byPlatform);
  const statusLines = capList(s.byStatus);
  const recentLines = s.recent.map((r) => {
    const icon = PLATFORM_ICON[r.PLATFORM] ?? "•";
    return `  ${icon} ${r.VIDEO_ID}(${r.STATUS},${r.DATE})`;
  });

  const out = [
    `📊 暫存區統計(共 ${s.total} 筆)`,
    "",
    "各平台:",
    ...platformLines,
    "",
    "各狀態:",
    ...statusLines,
    "",
    `本週新增:${s.addedThisWeek}　本月新增:${s.addedThisMonth}`,
    "",
    `最近 ${s.recent.length} 筆:`,
    ...recentLines,
  ].join("\n");

  // Telegram 單則上限 4096;保險再硬切。
  return out.length > 3900 ? out.slice(0, 3900) + "\n…(已截斷)" : out;
}
