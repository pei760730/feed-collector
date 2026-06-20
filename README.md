# OF DOG —— Telegram 短影音收集 / 佇列 bot

把跑在 n8n 上的「OF DOG」流程改寫成獨立、可自架、可版本控管的服務。
貼一則含影片連結的 Telegram 訊息 → 解析 → 清理 → **FB 轉址解開** → 判平台 → 抽 video ID →
去重 → 寫 Google Sheet「暫存區」,並標上 `pending_review` / `unsupported` 狀態供**下游 worker** 接手。

> 姊妹專案:[short-video-bot](https://github.com/pei760730/short-video-bot)。
> 本支較單純、**Facebook / 轉址解析更強**、並帶 `pending_review` / `unsupported` 狀態流程。

## 流程

```
Telegram 訊息
  → Parse（抽第一個網址;無網址 → 格式錯誤回覆;本版不抓備註）
  → Clean（去追蹤參數 / 清 hash / 去尾斜線）
  → Extract（步驟0 解 FB 轉址 → 判平台 → 抽帶前綴 VIDEO_ID）
  → raw_*（無法解析）？
      ├─ 是 → STATUS=unsupported → 直接存（不查重）
      └─ 否 → 用 VIDEO_ID 查重
              ├─ 重複 → 回「已存在,跳過」（不存）
              └─ 新的 → STATUS=pending_review → 存
```

## 平台與 ID 前綴

| 平台 | 前綴 | 範例 |
|------|------|------|
| Instagram | `ig_` | `/reel/`、`/reels/`、`/p/` |
| TikTok | `tt_` | `/video/<id>` |
| YouTube | `yt_` | `v=`、`shorts/`、`embed/`、`youtu.be/`(11 碼) |
| Facebook | `fbw_`/`fb_`/`fbs_` | `fb.watch`、`/reel|videos/`、`/share/[rvp]/`、`story_fbid`、`watch/?v=` |
| X (Twitter) | `x_` | `/status/<id>` |
| 小紅書 | `xhs_` | `/explore/`、`/discovery/item/` |
| Other / 抓不到 | `raw_<ts>` | → `unsupported` |

FB 轉址:`l.facebook.com/l.php?u=…` 會先 `decodeURIComponent` 還原成真實網址,
用內層網址判平台並回寫 `CLEAN_URL`。

## 資料契約（Google Sheet「暫存區」)

表頭(SSOT 在 `src/types.ts`):

```
PLATFORM | DATE | CLEAN_URL | VIDEO_ID | STATUS | ERROR_MSG | WORKER_RUN
```

- `STATUS`:`pending_review`(新、待下游)/ `unsupported`(無法解析、待人工)。
- `ERROR_MSG` / `WORKER_RUN`:**留給下游 worker,本服務 append 時一律留空、不覆寫**。
- 去重 key:`VIDEO_ID`(`raw_*` 視為唯一,不去重)。

## 開發

```bash
npm install
cp .env.example .env   # 填 TELEGRAM_BOT_TOKEN + Google 憑證
npm test               # 單元 / 整合測試(用 MemoryStorage,不碰網路)
npm run typecheck
npm run dev            # 本機 long polling(STORAGE=memory 可乾跑不寫真表)
```

機密一律走環境變數,`.env` / `service_account.json` 已被 `.gitignore` 擋,不進版控。

## 部署

- **預設:GitHub Actions cron drain**(`.github/workflows/collect.yml`)——
  每小時 `npm run drain` 把待領更新撈乾、寫表後結束。不需常駐機器。
  需在 repo secrets 設 `TELEGRAM_BOT_TOKEN` / `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SHEET_ID`。
- **常駐**:`BOT_MODE=polling`(`npm start`)或 `webhook`(需 `WEBHOOK_DOMAIN`),可 Docker 化
  (`docker compose up -d`)。⚠️ 本機 Docker/WSL2 連 googleapis 大封包會 `Premature close`,
  要常駐請上雲端 VM。
