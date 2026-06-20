import { describe, it, expect } from "vitest";
import { parseMessage, tidyUrl, NoUrlError } from "../src/pipeline/parse.js";

describe("parseMessage", () => {
  it("抽出第一個網址", () => {
    expect(parseMessage("看這個 https://x.com/a/status/1 笑死").rawUrl).toBe(
      "https://x.com/a/status/1",
    );
  });

  it("多個網址只取第一個", () => {
    expect(
      parseMessage("https://a.com/1 https://b.com/2").rawUrl,
    ).toBe("https://a.com/1");
  });

  it("沒有網址 → NoUrlError", () => {
    expect(() => parseMessage("純文字沒連結")).toThrow(NoUrlError);
  });

  it("空訊息 → NoUrlError", () => {
    expect(() => parseMessage("")).toThrow(NoUrlError);
  });

  it("tidyUrl 剝掉尾端中文與標點", () => {
    expect(tidyUrl("https://www.tiktok.com/@u/video/123。讚")).toBe(
      "https://www.tiktok.com/@u/video/123",
    );
  });
});
