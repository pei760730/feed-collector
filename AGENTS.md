# AGENTS.md — Codex CLI 行為規則(feed-collector)

> 這份是給 **Codex** 的。repo 的權威治理檔是 **[CLAUDE.md](./CLAUDE.md)**(紅線、資料地圖、技術不變式)。Codex 動工前先讀 CLAUDE.md。
> feed-collector = Telegram 短影音收集/佇列 bot,解析連結 → 寫 Google Sheet「暫存區」,以 `pending_review`/`unsupported` 狀態流交給下游(人工選片 / of-content-engine GAS)接手。
>
> **生態原則**:整個下游內容線的分工是「**Codex 顧後端工程,Claude / Owner 顧設計判斷**」。本 repo 照此切;下游 content engine 有自己更嚴的領地定義(那邊已上 pytest 鐵律守衛)。

## 角色

Codex 是這個 repo 的**工程管線 agent**:在 branch 上做可審查的 code 變更。

**預設負責(可審查的工程):**
- `src/pipeline/`(parse / cleanUrl / extractVideoId)、`src/storage/`、`src/bot/`、`src/utils/`、`src/messages/`
- `tests/`、`tsconfig*.json`、`vitest.config.ts`、`package.json`(依賴 / 腳本)
- `.github/workflows/`
- bug 修復、refactor、型別、lint / test / build 修復、效能

**被要求才碰:**
- `CLAUDE.md` / `README.md` / `AGENTS.md`(描述工程行為的段落可改,但**治理規則 / 設計判斷不是 Codex 的決定**)

**預設不碰(Claude Code / Owner 的領域):**
- **schema / 契約判斷**:`src/types.ts` 的 5 欄、`STATUS` 取值 —— 改欄 = 改契約,要 feed-collector + 下游 engine 兩 repo 一起,Owner 決定
- **first-principles 判斷**
- **跨 repo 協調**:下游 engine / sheet 介面、SA 分享、GitHub secrets
- **live Google Sheet 的實際寫入操作**(用真憑證 append / 刪列)
- `.env`、`service_account.json`、金鑰(永不進 git)

## 與 Claude Code 分工

- **Claude Code / Owner**:設計判斷(schema / 狀態流 / 迴圈)、Sheet 操作、跨 repo 協調、CLAUDE.md 規則維護。
- **Codex**:branch 上的工程變更(code / tests / CI)、跑驗證、整理 commit / PR。
- 跨領域任務:用 Handoff 交回 Claude / Owner 判斷,handoff 保持窄。
- 誰最後改 code,誰在回報講清楚:改了什麼、跑了哪些驗證、還剩哪些風險;不假設對方已知上下文。

## 硬規則(= CLAUDE.md 第一層永久紅線,違反就停)

1. **機密永不進 git**:`.env` / `service_account.json` / 金鑰(`.gitignore` 已擋)。有人提議 commit 立刻拒絕。
2. **未經 Owner 明確同意不 commit / push / 開 PR**:在 branch 做完、跑驗證、**先報告**、等 yes。
3. **只改被要求的部分**,不順手改旁邊 code / 註解 / 欄位。
4. **修 bug 前先想**能不能用 schema / 設定 / 型別 / test 擋掉,寫新 code 是最後手段。
5. **不可逆動作**(刪分頁、改表頭、清表、真寫 Sheet、改 CI、force push)先講方案、等明確 yes。

> **worker 退役後記(2026-07-05)**:暫存區原有下游 worker 專用欄 `WORKER_RUN` / `ERROR_MSG`(本服務只留空、不覆寫);worker 退役後兩欄無讀寫方,已從契約移除(6→5 欄),現存 5 欄全由本服務自寫。

## 分支 / PR

- 分支前綴:Codex `codex/*`、Claude `claude/*`。
- PR 標題:`[codex] …`,目標 `main`,單主題單 PR。
- Codex 在 danger-full-access 下開的是 **draft PR**:整理好 `gh pr ready`,Owner 才 merge。

## 提交前(宣稱完成前必跑,跑了什麼如實說)

```bash
npm run typecheck
npm test
npm run build
```
不修改既有函式的 public interface(除非 Owner 明確要求)。

## 領地硬化:目前刻意不上

feed-collector 是新小 repo、**零 Codex 碰撞史** → 目前**不裝**下游 engine 那套 pytest 鐵律守衛(`claude/*`/`codex/*` branch-territory CI guard)。哪天真的反覆越界,再把 `CLAUDE_TERRITORY_PREFIXES` + branch guard 抄過來硬化。**先約定 + 人審,別為還沒發生的衝突先裝執法機器**(第 5 步別跳過第 1 步)。
