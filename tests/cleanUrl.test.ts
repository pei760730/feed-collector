import { describe, it, expect } from "vitest";
import { cleanUrl } from "../src/pipeline/cleanUrl.js";

describe("cleanUrl", () => {
  it("移除追蹤參數但保留正常 query", () => {
    const out = cleanUrl(
      "https://www.youtube.com/watch?v=abc&utm_source=ig&fbclid=x&igsh=y&tt_from=z&s=1",
    );
    expect(out).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("清掉 hash", () => {
    expect(cleanUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("去尾斜線", () => {
    expect(cleanUrl("https://example.com/a/")).toBe("https://example.com/a");
  });

  it("全是追蹤參數 → 去到只剩 path", () => {
    expect(cleanUrl("https://example.com/a?fbclid=xyz")).toBe("https://example.com/a");
  });

  it("沒有協定也補上 https", () => {
    expect(cleanUrl("example.com/a")).toBe("https://example.com/a");
  });
});
