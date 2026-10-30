import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatMs, parsePlayback, pickImage, progressAt, SpotifyError, type NowPlaying } from "./api";
import { noticeFor } from "./useNowPlaying";

const track = {
  is_playing: true,
  progress_ms: 61_000,
  device: { name: "Desk speaker" },
  item: {
    name: "Song",
    duration_ms: 200_000,
    artists: [{ name: "A" }, { name: "B" }],
    album: {
      name: "Album",
      images: [
        { url: "640", width: 640 },
        { url: "300", width: 300 },
        { url: "64", width: 64 },
      ],
    },
  },
};

describe("parsePlayback", () => {
  it("reads a track", () => {
    expect(parsePlayback(track)).toEqual({
      isPlaying: true,
      title: "Song",
      artists: "A, B",
      album: "Album",
      artUrl: "300",
      progressMs: 61_000,
      durationMs: 200_000,
      device: "Desk speaker",
    });
  });

  it("reads a podcast episode from its show", () => {
    const np = parsePlayback({
      is_playing: false,
      item: { name: "Ep 1", duration_ms: 1000, show: { name: "Show", publisher: "Pub" }, images: [{ url: "e", width: 640 }] },
    });
    expect(np).toMatchObject({ title: "Ep 1", artists: "Pub", album: "Show", artUrl: "e", isPlaying: false });
  });

  it("is null when nothing is loaded", () => {
    expect(parsePlayback(null)).toBeNull();
    expect(parsePlayback({ is_playing: true, item: null })).toBeNull();
  });
});

describe("pickImage", () => {
  it("takes the smallest big-enough image, else the largest", () => {
    expect(pickImage([{ url: "64", width: 64 }, { url: "640", width: 640 }])).toBe("640");
    expect(pickImage([{ url: "64", width: 64 }, { url: "100", width: 100 }])).toBe("100");
    expect(pickImage([])).toBeNull();
  });
});

describe("progressAt", () => {
  const np = parsePlayback(track)!;
  it("advances while playing and holds while paused", () => {
    expect(progressAt(np, 1000, 4000)).toBe(64_000);
    expect(progressAt({ ...np, isPlaying: false }, 1000, 4000)).toBe(61_000);
  });

  it("never passes the end of the track or goes backwards", () => {
    fc.assert(
      fc.property(fc.nat(600_000), fc.nat(600_000), fc.integer({ min: -10_000, max: 10_000_000 }), fc.boolean(), (p, d, dt, playing) => {
        const s: NowPlaying = { ...np, progressMs: Math.min(p, d), durationMs: d, isPlaying: playing };
        const v = progressAt(s, 0, dt);
        expect(v).toBeLessThanOrEqual(d);
        expect(v).toBeGreaterThanOrEqual(s.progressMs);
      }),
    );
  });
});

describe("formatMs", () => {
  it("formats minutes and seconds", () => {
    expect(formatMs(0)).toBe("0:00");
    expect(formatMs(61_999)).toBe("1:01");
    expect(formatMs(3_600_000)).toBe("60:00");
  });
});

describe("noticeFor", () => {
  it("explains Premium and missing devices", () => {
    expect(noticeFor(new SpotifyError(403, "PREMIUM_REQUIRED"))).toBe("premium");
    expect(noticeFor(new SpotifyError(404, "NO_ACTIVE_DEVICE"))).toBe("noDevice");
    expect(noticeFor(new Error("x"))).toBe("failed");
  });
});
