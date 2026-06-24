# CLAUDE.md — feed-collector 協作規則

> 接手這個 repo(含 AI)先讀這份。feed-collector = Telegram 短影音收集/佇列 bot,取代舊 n8n「feed-collector」流程。
> 貼影片連結 → 解析→清理→FB 轉址解開→判平台→抽 video ID→去重→寫 Google Sheet「暫存區」,
> 標 `pending_review` / `unsupported` 狀態供**下游 worker** 接手。

## 第一層:永久紅線(違反就停)

1. **機密永不進 git**:`TELEGRAM_BOT_TOKEN`、`service_account.json`、`.env`。`.gitignore` 已擋,有人提議 commit 立刻拒絕。
2. **未經明確同意不 commit / push / 開 PR**。在 branch 做完、跑 `npm test` + `npm run typecheck`、先報告,等 yes。
3. **只改被要求的部分**,不順手改旁邊的 code/欄位。
4. **n8n 的 regex 與邏輯 1:1 保留**,別憑印象重寫跑掉行為。改抽取規則先補 / 改 `tests/`。
5. **`ERROR_MSG` / `WORKER_RUN` 是下游 worker 的欄**:本服務 append 一律留空,**永不覆寫**既有列。

## 第二層:資料地圖

| 找什麼 | 去哪 |
|---|---|
| 「暫存區」欄位 / schema(SSOT) | `src/types.ts`:`StagingRow` / `STAGING_COLUMNS` / `STATUS` |
| 抽第一個網址(不抓備註) | `src/pipeline/parse.ts` |
| 清網址(追蹤參數 / hash / 尾斜線 / 行動版→桌面版 host 正規化) | `src/pipeline/cleanUrl.ts` |
| **FB 轉址解開 + 判平台 + 抽 ID(核心)** | `src/pipeline/extractVideoId.ts` |
| 去重 / 寫入介面 | `src/storage/Storage.ts` |
| Google Sheets 實作 | `src/storage/googleSheets.ts` |
| 測試用記憶體 storage | `src/storage/memory.ts` |
| 主流程 handler | `src/bot/handlers/ingest.ts`(`runIngest`,不依賴 Telegraf) |
| 指令路由 / 錯誤通知 | `src/bot/router.ts` |
| 訊息模板 | `src/messages/templates.ts` |
| 設定 / 環境變數 | `src/config.ts`(範本 `.env.example`) |
| 一次性撈乾(Actions cron) | `src/drain.ts` |

## 第三層:技術不變式

- **pipeline 全純函式**:parse / cleanUrl / extractVideoId 無副作用、無網路;I/O 隔在 storage + handler。
- **時區固定 `Asia/Taipei`**;DATE 格式 `YYYY/M/D`(不補零)。
- **寫入一律 RAW**(不用 USER_ENTERED),避免 video ID / 開頭 0 被吃成數字。
- **訊息純文字**,不用 MarkdownV2(舊版跳脫漏字會發送失敗)。
- **去重靠 `VIDEO_ID`**(去多餘空白);`raw_*`(unsupported)視為唯一**不去重**、直接存。
- **查重→append 同進程序列化**(`ingest.ts` 的 `serialize`),擋同連結並發雙寫。
- **storage 只認 `Storage` 介面**:換來源新增實作即可,handler 不動。
- **最小權限**:Google 只用 `spreadsheets` scope。**fail fast**:缺必要 env 啟動就丟錯。

## 第四層:環境

- 使用者 **Kai / Pei**([pei760730](https://github.com/pei760730)),回覆繁體中文、短句直接。
- 技術棧已定案:Node.js + TypeScript、telegraf、googleapis、dayjs、vitest。儲存 Google Sheets。
- 部署:**GitHub Actions cron drain(預設)** —— `collect.yml` 每 6h `npm run drain`。
  間隔必須明顯 < Telegram 的 ~24h 留存(24h 整=零邊際會掉訊息);6h 留 4 倍邊際、≈ $0。
  **不要在本機 Docker/WSL2 跑常駐**
  (連 googleapis 帶 JWT 大封包會 `Premature close`)。要「秒回」用雲端 VM 常駐 polling。
- 開發指令:`npm run dev`、`npm test`、`npm run typecheck`、`npm run build`。

## 第五層:待確認(邊做邊修)

- 備註擷取:本版**不抓**(規格如此);要加再開。
- 短網址展開(`EXPAND_SHORT_URLS`)預設關;要對 vm./vt.tiktok、xhslink 跟隨 redirect 再開並驗。
- 下游 worker 契約細節(它讀哪些 STATUS、寫回哪些欄位)待對齊,以免欄位衝突。改本服務寫入欄位前先確認。
- 與姊妹專案 short-video-bot 的 ID 前綴**不同**(本支 `tt_` vs 另一支 `tiktok_`)。
  若未來兩支共用同一張表,需先統一前綴規則,否則去重失效。**目前各自獨立表 → 無衝突**。

## 第六層:多 Agent 協作(Claude Code × Codex)

單一真相在本檔;Codex 視角的細則見 [AGENTS.md](./AGENTS.md)。生態原則:**Codex 顧後端工程,Claude / Owner 顧設計判斷**。

| 領地 | Claude Code / Owner | Codex |
|---|---|---|
| 分支前綴 | `claude/*` | `codex/*`(PR 標題 `[codex]`,draft PR → `gh pr ready` → Owner merge) |
| 程式 | 設計判斷、跨 repo 協調、Sheet 操作 | `src/`(pipeline/storage/bot/utils/messages)、`tests/`、CI、Docker、依賴 |
| 治理 / schema | `CLAUDE.md`、`src/types.ts` 7 欄契約、`ERROR_MSG`/`WORKER_RUN` 語意、迴圈架構 | 被要求才碰,且只改「描述工程行為」段落 |

- **跨領地改動**:在 PR 說明原因、人工 review merge。揭露 ≠ 授權。
- **Claude 自律**:不主動重構 Codex 領地;審 Codex PR 只驗不重寫。
- **硬化目前刻意不上**:新小 repo 零碰撞史,不裝 of-content-engine 那套 branch-territory 鐵律 CI;反覆越界才硬化。
