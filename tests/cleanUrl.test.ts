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

  it("行動版 host 正規化成桌面版(dedup 收斂)", () => {
    expect(cleanUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(cleanUrl("https://m.tiktok.com/@u/video/7234567890")).toBe(
      "https://www.tiktok.com/@u/video/7234567890",
    );
    expect(cleanUrl("https://mobile.twitter.com/a/status/12345")).toBe(
      "https://twitter.com/a/status/12345",
    );
  });

  it("清掉 Threads/Meta 分享追蹤碼(xmt/slof)", () => {
    expect(
      cleanUrl("https://www.threads.com/@u/post/DZwtc9Jk7Yf?xmt=AQG0abc&slof=1"),
    ).toBe("https://www.threads.com/@u/post/DZwtc9Jk7Yf");
  });

  it("清掉 Facebook 分享 / 轉址追蹤碼(mibextid/rdid),保留 v", () => {
    expect(
      cleanUrl("https://www.facebook.com/share/v/1Ak36Nk2kS/?mibextid=wwXIfr"),
    ).toBe("https://www.facebook.com/share/v/1Ak36Nk2kS");
    expect(
      cleanUrl("https://www.facebook.com/watch/?v=880138511189246&rdid=abc"),
    ).toBe("https://www.facebook.com/watch?v=880138511189246");
  });

  it("x/twitter 的 t 是追蹤碼 → 砍(連同 s)", () => {
    expect(cleanUrl("https://x.com/u/status/123?s=20&t=abc")).toBe(
      "https://x.com/u/status/123",
    );
    expect(cleanUrl("https://x.com/u/status/123?t=abc")).toBe(
      "https://x.com/u/status/123",
    );
  });

  it("YouTube 的 t 是起始秒數 → 保留(不被當追蹤碼砍)", () => {
    expect(cleanUrl("https://www.youtube.com/watch?v=XYZ&t=30s")).toBe(
      "https://www.youtube.com/watch?v=XYZ&t=30s",
    );
  });
});
