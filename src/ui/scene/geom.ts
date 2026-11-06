/** Shared shapes and a small seeded PRNG for the scene's pure modules (no DOM, no three). */

export type Pt = readonly [number, number];

/** A rectangle in CSS px, y down from the top of the viewport. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface View {
  w: number;
  h: number;
}

export type SceneMode = "play" | "display";

/** Mulberry32: tiny, fast and good enough to scatter blossoms and petals reproducibly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const contains = (r: Rect, x: number, y: number, inset = 0) =>
  x >= r.x + inset && x <= r.x + r.w - inset && y >= r.y + inset && y <= r.y + r.h - inset;

/** Point a fraction `f` of the way along a polyline, by arc length. */
export function along(points: readonly Pt[], f: number): Pt {
  const first = points[0];
  if (!first) return [0, 0];
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lens.push(l);
    total += l;
  }
  let want = clamp(f, 0, 1) * total;
  for (let i = 1; i < points.length; i++) {
    const l = lens[i - 1]!;
    const a = points[i - 1]!;
    const b = points[i]!;
    if (want <= l || i === points.length - 1) {
      const k = l === 0 ? 0 : clamp(want / l, 0, 1);
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    want -= l;
  }
  return first;
}
