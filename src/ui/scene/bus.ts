import { useEffect } from "react";
import type { Rect, SceneMode } from "./geom";

/**
 * The few things the app tells the scene. Lives in the initial bundle and imports nothing heavy:
 * the three.js runtime loads later and subscribes; anything said before it loads is dropped,
 * which is right for gusts (the CSS fallback does not animate) and harmless for the rest.
 */
export interface SceneState {
  mode: SceneMode;
  /** Display's night dimming (22:00-07:00). */
  dim: boolean;
  /** Display's burn-in drift, px. */
  drift: readonly [number, number];
}

export type SceneRequest = { kind: "gust"; unit: Rect; board: Rect } | { kind: "storm" };

let state: SceneState = { mode: "play", dim: false, drift: [0, 0] };
const listeners = new Set<() => void>();
let handler: ((r: SceneRequest) => void) | null = null;

export const sceneBus = {
  get: (): SceneState => state,
  set(patch: Partial<SceneState>) {
    const next = { ...state, ...patch };
    if (next.mode === state.mode && next.dim === state.dim && next.drift[0] === state.drift[0] && next.drift[1] === state.drift[1]) return;
    state = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  /** The runtime claims requests; returns the release. */
  handle(h: (r: SceneRequest) => void) {
    handler = h;
    return () => {
      if (handler === h) handler = null;
    };
  },
};

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** A row, column or box was just completed: blow a gust of petals out of it. */
export function sceneGust(cells: readonly number[]): void {
  if (!handler || cells.length === 0) return;
  const board = rectOf(document.querySelector(".board"));
  if (!board) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    const r = rectOf(document.querySelector(`[data-cell="${c}"]`));
    if (!r) continue;
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  if (x0 === Infinity) return;
  handler({ kind: "gust", unit: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, board });
}

let lastStorm: unknown;
/** The puzzle was solved. `key` identifies the solve, so a render that repeats it storms once. */
export function sceneStorm(key: unknown): void {
  if (!handler || key === lastStorm) return;
  lastStorm = key;
  handler({ kind: "storm" });
}

/** Display mode composes the world for the monitor and passes its dimming and drift through. */
export function useDisplayScene(dim: boolean, dx: number, dy: number): void {
  useEffect(() => {
    sceneBus.set({ mode: "display" });
    return () => sceneBus.set({ mode: "play", dim: false, drift: [0, 0] });
  }, []);
  useEffect(() => sceneBus.set({ dim, drift: [dx, dy] }), [dim, dx, dy]);
}

/** Counters e2e reads under ?test=1 (docs/ARCHITECTURE.md, "Testing hooks"). */
export const sceneStats = { frames: 0, looping: false, ready: false };

if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("test")) {
  (window as unknown as { __sudokuScene: unknown }).__sudokuScene = {
    frames: () => sceneStats.frames,
    looping: () => sceneStats.looping,
    ready: () => sceneStats.ready,
  };
}
