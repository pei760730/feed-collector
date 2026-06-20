/**
 * 日期工具 —— 固定 Asia/Taipei 時區。
 * DATE 欄格式 YYYY/M/D(年/月/日,不補零;沿用 n8n moment 行為)。
 */
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const TZ = "Asia/Taipei";

/** 今天日期字串 YYYY/M/D(台北);epoch ms 可注入以利測試。 */
export function todayTaipei(nowMs: number = Date.now()): string {
  const d = dayjs(nowMs).tz(TZ);
  return `${d.year()}/${d.month() + 1}/${d.date()}`;
}
