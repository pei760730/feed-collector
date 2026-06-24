/**
 * 讀環境變數 → 型別化 config。憑證/token 一律走 env,不進版控。
 * 缺必要變數會在啟動時丟錯(fail fast),不要讓 bot 帶半套設定跑起來。
 */
import dotenv from "dotenv";
import { readFileSync } from "node:fs";

// override:true —— .env 蓋過系統既有環境變數,避免殘留舊/打錯的 token。
dotenv.config({ override: true });

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`缺少必要環境變數:${name}(請參考 .env.example)`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null || v.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

function numEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v.trim());
  if (!Number.isFinite(n)) {
    throw new Error(`環境變數 ${name} 不是合法數字:'${v}'`);
  }
  return n;
}

function enumEnv<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = (process.env[name] ?? "").trim();
  if (v === "") return fallback;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`環境變數 ${name} 只能是 ${allowed.join(" / ")},收到:'${v}'`);
  }
  return v as T;
}

/**
 * 逗號分隔的 chat/user id 白名單(來源授權)。非整數項直接丟錯(fail-fast,
 * 別讓打錯的 id 默默失效後還「以為有保護」)。空字串 → 空陣列(是否強制由 loadConfig 決定)。
 */
function chatIdsEnv(name: string): number[] {
  const v = (process.env[name] ?? "").trim();
  if (v === "") return [];
  return v.split(",").map((s) => {
    const t = s.trim();
    const n = Number(t);
    if (!Number.isInteger(n)) {
      throw new Error(`環境變數 ${name} 內含非整數 chat id:'${t}'(請用逗號分隔的純數字 id)`);
    }
    return n;
  });
}

export type BotMode = "polling" | "webhook";
export type StorageMode = "sheets" | "memory";

export interface Config {
  telegramToken: string;
  mode: BotMode;
  storage: StorageMode;
  webhook: { domain: string; path: string; port: number };
  /** memory 乾跑模式下為 null(不需 Google 憑證)。 */
  google: {
    credentials: { client_email: string; private_key: string };
    sheetId: string;
    stagingSheetName: string;
    prodSheetName: string;
  } | null;
  errorChatId: string;
  /** 來源白名單:只處理這些 chat/user id 的訊息(公開後防陌生人灌池)。空=不限制,僅限乾跑/開發。 */
  allowedChatIds: number[];
  expandShortUrls: boolean;
  logLevel: string;
}

/** 取得 Google service account 憑證。優先序:JSON 字串 > base64 > 檔案路徑。 */
function loadGoogleCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();

  let jsonText: string | undefined;
  if (raw) {
    jsonText = raw;
  } else if (b64) {
    jsonText = Buffer.from(b64, "base64").toString("utf-8");
  } else if (file) {
    jsonText = readFileSync(file, "utf-8");
  } else {
    throw new Error(
      "缺少 Google 憑證:請設 GOOGLE_SERVICE_ACCOUNT_JSON / _BASE64 / _FILE 其一",
    );
  }

  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("GOOGLE service account JSON 解析失敗(格式不是合法 JSON)");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("service account JSON 缺 client_email / private_key");
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const mode = enumEnv("BOT_MODE", ["polling", "webhook"] as const, "polling");
  const storage = enumEnv("STORAGE", ["sheets", "memory"] as const, "sheets");
  const google =
    storage === "memory"
      ? null
      : {
          credentials: loadGoogleCredentials(),
          sheetId: required("GOOGLE_SHEET_ID"),
          stagingSheetName: optional("STAGING_SHEET_NAME", "暫存區"),
          prodSheetName: optional("PROD_SHEET_NAME", "總表"),
        };
  cached = {
    telegramToken: required("TELEGRAM_BOT_TOKEN"),
    mode,
    storage,
    webhook: {
      domain: optional("WEBHOOK_DOMAIN", ""),
      path: optional("WEBHOOK_PATH", "/telegraf"),
      port: numEnv("PORT", 8080),
    },
    google,
    errorChatId: optional("ERROR_CHAT_ID", ""),
    allowedChatIds: chatIdsEnv("ALLOWED_CHAT_IDS"),
    expandShortUrls: boolEnv("EXPAND_SHORT_URLS", false),
    logLevel: optional("LOG_LEVEL", "info"),
  };
  if (mode === "webhook" && !cached.webhook.domain) {
    throw new Error("BOT_MODE=webhook 但未設 WEBHOOK_DOMAIN");
  }
  // 公開 repo 防灌池:sheets 模式(=正式寫真表)必須設來源白名單,否則任何人都能餵 bot 寫進你的表。
  // 寧可 fail-fast 紅燈被發現,也不要默默大開。memory 乾跑不寫真表,免設。
  if (storage === "sheets" && cached.allowedChatIds.length === 0) {
    throw new Error(
      "STORAGE=sheets 但未設 ALLOWED_CHAT_IDS:正式寫表必須限定來源 chat id(逗號分隔純數字),否則公開後任何人都能灌你的暫存區",
    );
  }
  return cached;
}
