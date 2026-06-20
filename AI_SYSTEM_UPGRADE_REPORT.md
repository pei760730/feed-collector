# AI System Upgrade Report — OF-DOG

> 每次 Sleep Mode / 系統穩定化跑一輪,附加一個 `## Run` 區段,不覆蓋舊紀錄。
> 這份是給下一個 agent(Claude / Codex)防錯用的事實基線,不是作文。

---

## Run 2026-06-21 (HEAD d1094c8)

### Base
- Branch: `main`
- HEAD: `d1094c8` (fix: cleanUrl 行動版 host 正規化 (#3))
- Repo root: `C:/Users/user/projects/OF-DOG`
- Time: 2026-06-21 ~02:10 (Asia/Taipei)
- Working tree before: **clean**, synced with `origin/main`
- Working tree after: 2 檔修改(本輪,未 commit)—— `CLAUDE.md`、`AI_SYSTEM_UPGRADE_REPORT.md`(本檔,新增)
- Pre-existing modified/untracked: 無

### Project snapshot
- Type: Telegram 短影音收集/佇列 bot(取代 n8n「OF DOG」)
- Language: Node.js + TypeScript(ESM, NodeNext)
- Package manager / build: npm(package-lock)/ `tsc`
- Entrypoints: `src/index.ts`(polling/webhook 常駐)、`src/drain.ts`(Actions cron 一次性撈乾)
- Automation: `.github/workflows/ci.yml`(typecheck+test+build)、`collect.yml`(每 6h drain)
- Validation 實際可用: `npm run typecheck` / `npm test`(vitest)/ `npm run build`
- Docs / AI 檔: `README.md`、`CLAUDE.md`、`AGENTS.md`
- High-risk areas: `src/storage/googleSheets.ts`(寫正式 Sheet)、`ERROR_MSG`/`WORKER_RUN` 下游契約欄、`src/types.ts` 7 欄 schema

### What I inspected
- git 基線、35 個追蹤檔清單
- 健康基線:typecheck / 47 tests / build 全綠
- 設定漂移:`config.ts` 讀的 env vs `.env.example` 記的(逐一比對)
- 文件真相:`CLAUDE.md` vs 近期 PR(#1 Threads、#3 行動版正規化)
- 假成功掃描:`process.exit` / catch 行為
- package scripts 是否指向實存檔案
- branch(read-only)、Node 版本一致性(engines / CI / Docker)

### System-level issues found
#### High risk
- 無。

#### Medium risk
- 無。

#### Low risk
- `CLAUDE.md` 資料地圖的 cleanUrl 說明未含 PR#3 新增的「行動版→桌面版 host 正規化」。**本輪已補**(真相對齊,additive)。

#### 誤報(已用反向驗證排除,記錄以免下輪重踩)
- 一度懷疑 `.env.example` 缺 `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`;**實為假陽性** —— 它在 `.env.example:18`,只是審查用的 grep 正則 `[A-Z_]` 不含數字、把字尾 `64` 漏掉。直接讀檔即排除。教訓:env key 含數字,別用 `[A-Z_]+` 比對。

### Change ledger
| File | Change | Reason | Risk | Verification |
|---|---|---|---|---|
| `CLAUDE.md` | 資料地圖 cleanUrl 列補「行動版→桌面版 host 正規化」 | PR#3 後文件落後實作 | low(doc-only) | 人工讀 diff;不影響 build/test |
| `AI_SYSTEM_UPGRADE_REPORT.md` | 新增本報告 | 給下一個 agent 的事實基線 | low(新檔) | 本檔即產物 |

### Verification run
| Check | Command | Result | Notes |
|---|---|---|---|
| typecheck | `npm run typecheck` | pass | |
| tests | `npm test` | pass(47) | |
| build | `npm run build` | pass | |
| diff check | `git diff --check` | clean | |
| scripts→files | node 檢查 | pass | 所有 script 指向實存檔/build 產物 |
| 假成功 | grep `process.exit` | clean | 只在 `main().catch` → `exit(1)` |

### Issues fixed with evidence
- CLAUDE.md cleanUrl 說明對齊 PR#3:見上方 diff;doc-only,test/build 仍綠。

### Existing issues not fixed
- 無 code 級問題。OF-DOG 本身已過兩輪獨立 review(commit `635e99f`)+ post-merge 對齊,狀態良好。

### Remaining risks
- **執行語意 trade-off(非 bug)**:預設部署 = 每 6h cron drain → 收訊息+回覆最多延遲 ~6h(非即時)。要秒回需雲端 VM 常駐 polling(本機 Docker/WSL2 會 `Premature close`)。已記於 `CLAUDE.md`/`README.md`。
- **CI Node 20 deprecation(建議,未改)**:`actions/checkout@v4` / `actions/setup-node@v4` 被 GitHub forced 到 Node 24,每跑印 deprecation 警告。純警告、目前不影響。建議下次連網時 bump action 版本驗過再改 —— **本輪不改**(無法本機驗證 CI 變更,保守)。

### Branch cleanup candidates
#### Possibly safe to delete after human review
- 無(本地只剩 `main`)。
#### Do not delete yet
- `main`。

### Recommended next actions
1. (Owner / 下個 session)把本輪 2 個 doc 變更 commit(`docs: align CLAUDE.md + add upgrade report`)—— 安全。
2. 連網時評估 bump CI actions 版本(消 Node 20 警告)。
3. of-content-engine 那邊:接 OF-DOG↔engine 介面 + 清「暫存區」舊 n8n 髒列(另開 session,已有交辦 prompt)。

### Safe to commit?
- Yes:本輪只動 `CLAUDE.md`(doc 真相對齊)+ 新增本報告,doc-only、test/build 全綠、零行為變更。
- 條件:依 Sleep Mode 規則**本輪未自行 commit**;由 Owner / 下個 session 提交。
