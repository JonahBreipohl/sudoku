import { describe, expect, it, vi } from "vitest";
import { createWakeLock, fullscreenSupported, wakeLockSupported, type VisibilityDoc, type WakeLockSentinelLike } from "./wakeLock";

function setup(opts: { reject?: boolean } = {}) {
  const sentinels: { s: WakeLockSentinelLike; fireRelease: () => void; release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    if (opts.reject) throw new Error("NotAllowedError");
    let l: () => void = () => {};
    const release = vi.fn(async () => {});
    const s: WakeLockSentinelLike = { release, addEventListener: (_t, fn) => (l = fn) };
    sentinels.push({ s, fireRelease: () => l(), release });
    return s;
  });
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible",
    addEventListener: (_t: "visibilitychange", fn: () => void) => listeners.add(fn),
    removeEventListener: (_t: "visibilitychange", fn: () => void) => listeners.delete(fn),
  } satisfies VisibilityDoc;
  const setVisibility = async (v: string) => {
    doc.visibilityState = v;
    listeners.forEach((fn) => fn());
    await Promise.resolve();
    await Promise.resolve();
  };
  const changes: boolean[] = [];
  const ctl = createWakeLock({ request }, doc, (h) => changes.push(h));
  return { ctl, request, sentinels, setVisibility, changes, listeners };
}

describe("support detection", () => {
  it("detects the APIs", () => {
    expect(wakeLockSupported(undefined)).toBe(false);
    expect(wakeLockSupported({})).toBe(false);
    expect(wakeLockSupported({ wakeLock: { request: async () => ({}) as WakeLockSentinelLike } })).toBe(true);
    expect(fullscreenSupported({})).toBe(false);
    expect(fullscreenSupported({ fullscreenEnabled: false })).toBe(false);
    expect(fullscreenSupported({ fullscreenEnabled: true })).toBe(true);
  });
});

describe("createWakeLock", () => {
  it("acquires on enable and releases on disable", async () => {
    const t = setup();
    expect(await t.ctl.enable()).toBe(true);
    expect(t.changes).toEqual([true]);
    await t.ctl.disable();
    expect(t.sentinels[0]?.release).toHaveBeenCalled();
    expect(t.changes).toEqual([true, false]);
  });

  it("re-acquires after the tab becomes visible again", async () => {
    const t = setup();
    await t.ctl.enable();
    await t.setVisibility("hidden");
    t.sentinels[0]?.fireRelease(); // browsers release the lock when hidden
    expect(t.changes).toEqual([true, false]);
    await t.setVisibility("visible");
    expect(t.request).toHaveBeenCalledTimes(2);
    expect(t.changes).toEqual([true, false, true]);
  });

  it("does not re-acquire after disable", async () => {
    const t = setup();
    await t.ctl.enable();
    await t.ctl.disable();
    await t.setVisibility("hidden");
    await t.setVisibility("visible");
    expect(t.request).toHaveBeenCalledTimes(1);
  });

  it("defers acquisition while hidden", async () => {
    const t = setup();
    await t.setVisibility("hidden");
    expect(await t.ctl.enable()).toBe(false);
    expect(t.request).not.toHaveBeenCalled();
    await t.setVisibility("visible");
    expect(t.request).toHaveBeenCalledTimes(1);
  });

  it("reports false when the request is denied", async () => {
    const t = setup({ reject: true });
    expect(await t.ctl.enable()).toBe(false);
    expect(t.changes).toEqual([]);
  });

  it("dispose removes the listener and releases", async () => {
    const t = setup();
    await t.ctl.enable();
    t.ctl.dispose();
    expect(t.listeners.size).toBe(0);
    expect(t.sentinels[0]?.release).toHaveBeenCalled();
  });
});
