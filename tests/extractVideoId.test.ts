import { describe, it, expect } from "vitest";
import { extractVideoId } from "../src/pipeline/extractVideoId.js";

const FIXED = () => 1_700_000_000_000;

describe("extractVideoId — 各平台正常抽取", () => {
  it("Instagram /reel/<code>", () => {
    const r = extractVideoId("https://www.instagram.com/reel/CxYz_-1");
    expect(r.platform).toBe("Instagram");
    expect(r.videoId).toBe("ig_CxYz_-1");
    expect(r.unsupported).toBe(false);
  });

  it("Instagram /p/<code>", () => {
    expect(extractVideoId("https://www.instagram.com/p/AbC123_-x").videoId).toBe("ig_AbC123_-x");
  });

  it("TikTok /video/<id> → tt_ 前綴", () => {
    const r = extractVideoId("https://www.tiktok.com/@u/video/7234567890");
    expect(r.platform).toBe("TikTok");
    expect(r.videoId).toBe("tt_7234567890");
  });

  it("YouTube watch?v=", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ").videoId).toBe(
      "yt_dQw4w9WgXcQ",
    );
  });

  it("YouTube youtu.be 短鏈", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ").videoId).toBe("yt_dQw4w9WgXcQ");
  });

  it("YouTube shorts", () => {
    expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ").videoId).toBe(
      "yt_dQw4w9WgXcQ",
    );
  });

  it("X /status/<id> → x_ 前綴", () => {
    const r = extractVideoId("https://x.com/someone/status/1690000000000000001");
    expect(r.platform).toBe("X");
    expect(r.videoId).toBe("x_1690000000000000001");
  });

  it("twitter.com 也判成 X", () => {
    expect(extractVideoId("https://twitter.com/a/status/12345").videoId).toBe("x_12345");
  });

  it("小紅書 /explore/<id>", () => {
    expect(extractVideoId("https://www.xiaohongshu.com/explore/abc123").videoId).toBe("xhs_abc123");
  });

  it("小紅書 /discovery/item/<id>", () => {
    expect(
      extractVideoId("https://www.xiaohongshu.com/discovery/item/64ab12cd").videoId,
    ).toBe("xhs_64ab12cd");
  });
});

describe("extractVideoId — Facebook 各形態", () => {
  it("A. fb.watch/<code> → fbw_", () => {
    const r = extractVideoId("https://fb.watch/abcXYZ_-");
    expect(r.platform).toBe("Facebook");
    expect(r.videoId).toBe("fbw_abcXYZ_-");
  });

  it("B. /reel/<n> → fb_", () => {
    expect(extractVideoId("https://www.facebook.com/reel/1234567890").videoId).toBe("fb_1234567890");
  });

  it("B. /videos/<n> → fb_", () => {
    expect(
      extractVideoId("https://www.facebook.com/page/videos/9876543210").videoId,
    ).toBe("fb_9876543210");
  });

  it("C. /share/r/<code> → fbs_", () => {
    expect(extractVideoId("https://www.facebook.com/share/r/AbCd123/").videoId).toBe("fbs_AbCd123");
  });

  it("C. /share/v/<code> → fbs_", () => {
    expect(extractVideoId("https://www.facebook.com/share/v/XyZ789/").videoId).toBe("fbs_XyZ789");
  });

  it("D. watch/?v= → fb_", () => {
    expect(
      extractVideoId("https://www.facebook.com/watch/?v=1122334455").videoId,
    ).toBe("fb_1122334455");
  });

  it("D. story_fbid → fb_", () => {
    expect(
      extractVideoId("https://www.facebook.com/permalink.php?story_fbid=555&id=1").videoId,
    ).toBe("fb_555");
  });

  it("m.facebook.com 仍判成 Facebook", () => {
    expect(extractVideoId("https://m.facebook.com/reel/42").platform).toBe("Facebook");
  });
});

describe("extractVideoId — FB 轉址解開(步驟 0)", () => {
  it("l.facebook.com/l.php?u=… → 還原內層 IG 並回寫 CLEAN_URL", () => {
    const inner = "https://www.instagram.com/reel/CxYz_-1";
    const wrapped = `https://l.facebook.com/l.php?u=${encodeURIComponent(inner)}&fbclid=abc`;
    const r = extractVideoId(wrapped);
    expect(r.platform).toBe("Instagram");
    expect(r.videoId).toBe("ig_CxYz_-1");
    expect(r.cleanUrl).toBe(inner);
  });

  it("l.facebook.com 還原內層 TikTok", () => {
    const inner = "https://www.tiktok.com/@u/video/7234567890";
    const wrapped = `https://l.facebook.com/l.php?u=${encodeURIComponent(inner)}`;
    expect(extractVideoId(wrapped).videoId).toBe("tt_7234567890");
  });
});

describe("extractVideoId — 抓不到 → raw_<ts> + unsupported", () => {
  it("Other 平台(不在清單)", () => {
    const r = extractVideoId("https://example.com/whatever", FIXED);
    expect(r.platform).toBe("Other");
    expect(r.videoId).toBe("raw_1700000000000");
    expect(r.unsupported).toBe(true);
  });

  it("認得平台但抽不到 ID", () => {
    const r = extractVideoId("https://www.facebook.com/somepage", FIXED);
    expect(r.platform).toBe("Facebook");
    expect(r.videoId).toBe("raw_1700000000000");
    expect(r.unsupported).toBe(true);
  });

  it("YouTube channel 不該被當影片", () => {
    expect(extractVideoId("https://www.youtube.com/channel/UCabcdefghij", FIXED).unsupported).toBe(
      true,
    );
  });
});
