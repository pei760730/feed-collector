# CLAUDE.md — feed-collector 協作規則

> 接手這個 repo(含 AI)先讀這份。feed-collector = Telegram 短影音收集/佇列 bot,取代舊 n8n「feed-collector」流程。
> 貼影片連結 → 解析→清理→FB 轉址解開→判平台→抽 video ID→去重→寫 Google Sheet「暫存區」,
> 標 `pending_review` / `unsupported` 狀態供**下游**(人工選片 / of-content-engine 的 GAS onEdit)接手。

## 第一層:永久紅線(違反就停)

1. **機密永不進 git**:`TELEGRAM_BOT_TOKEN`、`service_account.json`、`.env`。`.gitignore` 已擋,有人提議 commit 立刻拒絕。
2. **未經明確同意不 commit / push / 開 PR**。在 branch 做完、跑 `npm test` + `npm run typecheck`、先報告,等 yes。
3. **只改被要求的部分**,不順手改旁邊的 code/欄位。
4. **抽取/清理規則以 collector-core canonical 為對齊基準**(2026-06-27 起已兩輪對齊;接 core 是既定路線),改規則先補 / 改 `tests/`,別憑印象重寫跑掉行為。(舊「n8n regex 1:1」紅線已退役 2026-07-03:行為早非 n8n 1:1。)

> **worker 退役後記(2026-07-05)**:暫存區原本帶兩個「下游 worker 專用欄」`WORKER_RUN` / `ERROR_MSG`(本服務只 append 留空、永不覆寫)。worker 已退役 → 兩欄皆無讀寫方,已從契約移除(6→5 欄)。現存 5 欄全由本服務自寫,無下游專用欄。

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
- 部署:**GitHub Actions cron drain(預設)** —— `collect.yml` 設 `*/5` `npm run drain`,但
  **GitHub 對 public repo 的高頻排程會大幅節流,實際約每 2–3h 才觸發一次(非每 5 分)**。
  這不影響正確性:間隔只需明顯 < Telegram ~24h 留存,2–3h 遠小於 24h;且每次 run 都
  `getUpdates` 撈乾全部 pending,漏跑幾次也自癒。public repo Actions 免費 ≈ $0。
  **不要在本機 Docker/WSL2 跑常駐**
  (連 googleapis 帶 JWT 大封包會 `Premature close`)。Docker/webhook 部署線已於 2026-07-03 解散(常駐線從未上場);`npm run dev` = 本機 long polling,僅開發用。
- 開發指令:`npm run dev`、`npm test`、`npm run typecheck`、`npm run build`。

## 第五層:待確認(邊做邊修)

- 備註擷取:本版**不抓**(規格如此);要加再開。
- 短網址展開已於生產開啟(collect.yml `EXPAND_SHORT_URLS="true"`,失敗 graceful fallback 已驗);本機開發預設仍關。(2026-07-04 銷項)
- **Rule(2026-07-04 起 Observation → 2026-07-05 升級,已三度復發)**:退役一個機制時,掃除半徑要含 **(a) 全 docs/註解/dotfiles + (b) 跨 repo 共用契約的 consumer**。一次 grep 到底,別分兩次。
  觸發:任何「解散部署線/退役機制/刪 symbol/刪 sheet 欄」的 PR。理由:此 repo 全 AI-facing,殘留敘述=誤導下一個 agent;且「暫存區」schema 是跨 repo 共用契約,單邊改會炸另一邊。
  證據(三次):① PR #29 刪 Docker,`.dockerignore`+AGENTS.md 領地表殘留(#30 補)。② PR #32:of-content-engine 刪「暫存區」`WORKER_RUN` 欄,炸 feed-collector 的必要欄 fail-fast 守衛(跨 repo,3h 後才被告警發現)。③ PR #35 移除 `ERROR_MSG` 時漏掉 4 行 `下游 worker` 文件殘留,#36 才補。
  失效條件:同類掃除連續兩次(含跨 repo)零殘留 → 降回 Observation;若 owner 把「退役先跨 repo grep consumer + docs」寫進全域 feedback 記憶足夠覆蓋 → 本條移除。
- 下游接手方 = 人工選片 + of-content-engine 的 GAS onEdit(worker 已退役);GAS 認 STATUS 欄、搬整列,**不寫回暫存區任何欄** → 無欄位衝突。本服務寫入欄位前仍先確認下游現況。
- 與姊妹專案 short-video-bot 的 ID 前綴**不同**(本支 `tt_` vs 另一支 `tiktok_`)。
  若未來兩支共用同一張表,需先統一前綴規則,否則去重失效。**目前各自獨立表 → 無衝突**。

## 第六層:多 Agent 協作(Claude Code × Codex)

單一真相在本檔;Codex 視角的細則見 [AGENTS.md](./AGENTS.md)。生態原則:**Codex 顧後端工程,Claude / Owner 顧設計判斷**。

| 領地 | Claude Code / Owner | Codex |
|---|---|---|
| 分支前綴 | `claude/*` | `codex/*`(PR 標題 `[codex]`,draft PR → `gh pr ready` → Owner merge) |
| 程式 | 設計判斷、跨 repo 協調、Sheet 操作 | `src/`(pipeline/storage/bot/utils/messages)、`tests/`、CI、依賴 |
| 治理 / schema | `CLAUDE.md`、`src/types.ts` 5 欄契約、迴圈架構 | 被要求才碰,且只改「描述工程行為」段落 |

- **跨領地改動**:在 PR 說明原因、人工 review merge。揭露 ≠ 授權。
- **Claude 自律**:不主動重構 Codex 領地;審 Codex PR 只驗不重寫。
- **硬化目前刻意不上**:新小 repo 零碰撞史,不裝下游 engine 那套 branch-territory 鐵律 CI;反覆越界才硬化。
