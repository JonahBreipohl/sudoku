import { along, clamp, contains, rng, type Pt, type Rect, type SceneMode, type View } from "./geom";

/** One branch: a spline through `points` (CSS px), tapering from `base` to `tip` radius. */
export interface Limb {
  points: Pt[];
  base: number;
  tip: number;
}

export interface Blossom {
  x: number;
  y: number;
  /** Depth in px: positive sits in front of the branch, negative behind it. */
  z: number;
  /** Diameter in px. */
  size: number;
  spin: number;
  /** Rotation about the vertical axis, so a few flowers are seen side-on rather than flat. */
  tilt: number;
  /** 0..1 shade variation between flowers. */
  tone: number;
  bud: boolean;
}

/**
 * A cel cumulus: a body box [cx, cy, halfW, halfH] in union with lobes [cx, cy, r, front], all cut
 * flat at `base` (its underside). Front lobes draw their outline over the lobes behind them.
 */
export interface Cloud {
  body: [number, number, number, number];
  circles: [number, number, number, number][];
  base: number;
  /** How far the hard shade band reaches in from the lower-right edges, px. */
  shade: number;
}

export interface Composition {
  limbs: Limb[];
  blossoms: Blossom[];
  clouds: Cloud[];
  moon: { x: number; y: number; r: number };
  /** Warm lantern light low on the horizon at night. */
  lantern: { x: number; y: number; r: number };
  /** Screen y where the sky gradient reaches its horizon color. */
  horizon: number;
  /** Overall size factor: line widths and petal sizes follow it. */
  scale: number;
  /** Where a solve storm's petals come from: the blossom clusters. */
  sources: Pt[];
}

export interface Layout {
  view: View;
  mode: SceneMode;
  /** The board (Play) or read-only board (Display), opaque, above the canvas. */
  board?: Rect | null;
  /** Play: the controls column under the board. */
  panel?: Rect | null;
  /** Text that sits straight on the sky (the Display clock); nothing busy goes behind it. */
  text?: Rect | null;
}

const MIN_GUTTER = 150;
const MIN_BAND = 90;

/** Which framing the viewport gets; exported so tests can pin each case. */
export function framing(l: Layout): "gutters" | "band" | "display" | "corner" {
  const { view, board, panel } = l;
  if (l.mode === "display") return view.w >= view.h ? "display" : "corner";
  if (!board) return view.w >= 600 ? "gutters" : "corner";
  if (board.x >= MIN_GUTTER) return "gutters";
  const bandTop = board.y + board.h;
  const bandBottom = panel ? panel.y : view.h * 0.68;
  return bandBottom - bandTop >= MIN_BAND && view.h > view.w ? "band" : "corner";
}

/** Places the branch, blossoms, clouds and moon around the opaque board for this viewport. */
export function compose(l: Layout, seed = 7): Composition {
  const { w, h } = l.view;
  const s = clamp(Math.min(w, h) / 760, 0.62, 1.6);
  const rand = rng(seed);
  const kind = framing(l);
  const board: Rect = l.board ?? { x: w * 0.3, y: h * 0.08, w: w * 0.4, h: w * 0.4 };
  const limbs: Limb[] = [];
  const clouds: Cloud[] = [];
  const avoid: Rect[] = [];
  let moon: Composition["moon"];
  let horizon = h * 0.86;
  const lantern = { x: w * 0.5, y: h + 60 * s, r: Math.max(w, h) * 0.32 };
  // The two ends of the board's column: the header row above it is text on the sky.
  const header: Rect = { x: board.x - 32, y: 0, w: board.w + 64, h: board.y };

  if (kind === "gutters") {
    const L = board.x;
    const R = w - (board.x + board.w);
    avoid.push(header);
    limbs.push(
      { points: [[-50, h * 0.05], [L * 0.3, h * 0.12], [L * 0.6, h * 0.23], [L * 0.83, h * 0.33], [L - 22, h * 0.4]], base: 17 * s, tip: 2.4 * s },
      { points: [[L * 0.4, h * 0.165], [L * 0.55, h * 0.12], [L * 0.7, h * 0.08], [L * 0.8, h * 0.06]], base: 6 * s, tip: 1.6 * s },
      { points: [[L * 0.22, h * 0.11], [L * 0.17, h * 0.24], [L * 0.24, h * 0.38], [L * 0.38, h * 0.5]], base: 7.5 * s, tip: 1.8 * s },
      { points: [[L * 0.68, h * 0.27], [L * 0.6, h * 0.35], [L * 0.64, h * 0.45]], base: 4.5 * s, tip: 1.4 * s },
    );
    if (R >= MIN_GUTTER) {
      limbs.push(
        { points: [[w + 50, h * 0.14], [w - R * 0.4, h * 0.2], [w - R * 0.72, h * 0.18], [w - R * 0.86, h * 0.12]], base: 10 * s, tip: 1.8 * s },
        { points: [[w - R * 0.3, h * 0.19], [w - R * 0.38, h * 0.29], [w - R * 0.32, h * 0.37]], base: 4 * s, tip: 1.3 * s },
      );
      clouds.push(cumulus(w - R * 0.42, h * 0.43, R * 0.56, h * 0.53, rand));
    }
    // Cumulus towers rise off the bottom edge in the gutters. The middle stays open sky: the
    // controls' small text sits on the pale horizon there, which keeps it easy to read.
    clouds.push(cumulus(L * 0.34, h * 0.6, L * 1.05, h * 1.5, rand));
    if (R >= MIN_GUTTER) clouds.push(cumulus(w - R * 0.3, h * 0.68, R * 0.95, h * 1.5, rand));
    moon = { x: L * 0.52, y: h * 0.25, r: clamp(L * 0.16, 34, 70) };
    horizon = h * 0.88;
  } else if (kind === "band") {
    const top = board.y + board.h;
    const bottom = l.panel ? l.panel.y : h * 0.68;
    const bh = bottom - top;
    const cy = top + bh * 0.5;
    limbs.push(
      { points: [[w + 40, cy + bh * 0.2], [w * 0.74, cy + bh * 0.04], [w * 0.47, cy - bh * 0.12], [w * 0.2, cy - bh * 0.06], [w * 0.05, cy + bh * 0.08]], base: 13 * s, tip: 1.8 * s },
      { points: [[w * 0.62, cy - bh * 0.04], [w * 0.57, cy + bh * 0.22], [w * 0.62, cy + bh * 0.4]], base: 4.5 * s, tip: 1.3 * s },
      { points: [[w * 0.33, cy - bh * 0.1], [w * 0.29, cy - bh * 0.3], [w * 0.34, cy - bh * 0.44]], base: 4 * s, tip: 1.2 * s },
    );
    clouds.push(cumulus(w * 0.5, top + bh * 0.5, w * 1.3, h * 1.5, rand, bh * 0.3));
    moon = { x: w * 0.2, y: cy - bh * 0.08, r: clamp(bh * 0.26, 26, 52) };
    horizon = bottom + 30;
  } else if (kind === "display") {
    const text = l.text ?? { x: w * 0.05, y: h * 0.36, w: w * 0.4, h: h * 0.28 };
    const end = Math.min(w * 0.47, board.x - 34);
    const top = Math.min(h * 0.3, text.y - 30);
    avoid.push({ x: text.x - 24, y: text.y - 24, w: text.w + 48, h: text.h + 48 });
    limbs.push(
      { points: [[-50, h * 0.02], [end * 0.34, h * 0.07], [end * 0.64, top * 0.5], [end * 0.88, top * 0.62], [end, top * 0.55]], base: 18 * s, tip: 2.2 * s },
      { points: [[end * 0.24, h * 0.06], [end * 0.2, top * 0.6], [end * 0.28, top * 0.92]], base: 7 * s, tip: 1.6 * s },
      { points: [[end * 0.58, top * 0.45], [end * 0.68, top * 0.22], [end * 0.76, top * 0.08]], base: 5 * s, tip: 1.4 * s },
      { points: [[w + 50, h * 0.96], [w - (w - board.x - board.w) * 0.6 - 40, h * 0.92], [board.x + board.w * 0.78, h * 0.95]], base: 8 * s, tip: 1.6 * s },
    );
    // A cumulus tower rises behind the clock, so its text stands on a calm, light ground.
    clouds.push(cumulus(text.x + text.w * 0.5, text.y - 90 * s, text.w * 2.1, h * 1.5, rand));
    clouds.push(cumulus(board.x + board.w * 0.5, board.y + board.h - 40, board.w * 1.25, h * 1.5, rand));
    moon = { x: end * 0.62, y: top * 0.42, r: clamp(h * 0.075, 36, 90) };
    horizon = h * 0.92;
  } else {
    // Short or odd viewports: one twig in the top corner keeps the world without crowding.
    limbs.push(
      { points: [[w + 40, -10], [w * 0.86, h * 0.05], [w * 0.74, h * 0.07], [w * 0.66, h * 0.05]], base: 8 * s, tip: 1.4 * s },
    );
    clouds.push(cumulus(w * 0.2, h * 0.78, w * 0.5, h * 1.5, rand));
    moon = { x: w * 0.12, y: h * 0.12, r: 30 * s };
  }

  const blossoms: Blossom[] = [];
  const sources: Pt[] = [];
  const unit = 33 * s * (kind === "band" ? 1.3 : 1);
  limbs.forEach((limb, li) => {
    const main = li === 0;
    const from = main ? 0.26 : 0.3;
    const step = main ? 0.12 : 0.21;
    for (let f = from; f <= 1.0001; f += step * (0.75 + rand() * 0.5)) {
      const [cx, cy] = along(limb.points, f);
      sources.push([cx, cy]);
      // Tight clumps with bare bark between them give the branch its rhythm.
      const n = (main ? 4 : 3) + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const d = unit * (0.15 + rand() * 0.75);
        const bud = rand() < 0.14;
        const size = unit * (bud ? 0.42 : 0.85 + rand() * 0.4);
        // Clusters hang below their twig, the way sakura droop on short stalks.
        const x = cx + Math.cos(a) * d;
        const y = cy + Math.abs(Math.sin(a)) * d * 0.9 + unit * 0.12;
        blossoms.push({
          x,
          y,
          z: rand() < 0.22 ? -30 - rand() * 20 : 24 + rand() * 40,
          size,
          spin: rand() * Math.PI * 2,
          tilt: rand() < 0.2 ? 0.7 + rand() * 0.45 : rand() * 0.35,
          tone: rand(),
          bud,
        });
      }
    }
  });

  const hidden = l.board ? [l.board] : [];
  const kept = blossoms.filter(
    (b) =>
      b.x > -b.size && b.x < w + b.size && b.y > -b.size && b.y < h + b.size &&
      !avoid.some((r) => contains(r, b.x, b.y, -b.size * 0.5)) &&
      // Wholly behind the opaque board: never seen, so not drawn.
      !hidden.some((r) => contains(r, b.x, b.y, b.size * 0.5)),
  );
  return { limbs, blossoms: kept, clouds, moon, lantern, horizon, scale: s, sources };
}

/** Lobes per cloud; the sky shader's per-cloud loop has the same bound. */
export const CLOUD_BUMPS = 14;

/**
 * A cel cumulus whose crown reaches `top`, `width` wide, standing on `base` (often far below the
 * screen): lobes along a dome, two billows down each flank, and a solid body filling the rest.
 */
function cumulus(cx: number, top: number, width: number, base: number, rand: () => number, maxDome = Infinity): Cloud {
  const height = base - top;
  const n = 7;
  const r = (width / (n + 1)) * 0.95;
  const dome = Math.min(height * 0.45, width * 0.22, maxDome);
  const circles: Cloud["circles"] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const crown = Math.sin(t * Math.PI);
    const ri = r * (0.72 + 0.5 * crown) * (0.88 + rand() * 0.24);
    const x = cx + (t - 0.5) * (width - 2 * r) + (rand() - 0.5) * r * 0.3;
    const y = top + dome * (1 - Math.pow(crown, 0.9)) + (rand() - 0.5) * r * 0.25;
    circles.push([x, y + ri, ri, i % 2]);
  }
  // A crown puff, off-centre, so the silhouette is not symmetric.
  const rc = r * 1.05;
  circles.push([cx + (rand() - 0.25) * width * 0.2, top + rc * 0.75, rc, 1]);
  // The body starts at the lobes' centre line, so no sky shows between lobes and body.
  const shoulder = top + dome * 0.6 + r * 0.8;
  const half = width * 0.5 - r * 0.7;
  for (const side of [-1, 1])
    for (const k of [0, 1]) {
      const rf = r * (1.15 + rand() * 0.25);
      circles.push([cx + side * (half - rf * 0.35 + k * r * 0.25), shoulder + rf * (0.7 + k * 1.6), rf, k]);
    }
  return {
    body: [cx, (shoulder + base) / 2 + 10, half - r * 0.3, (base - shoulder) / 2 + 10],
    circles,
    base,
    shade: Math.min(height, width * 0.5) * 0.2,
  };
}

/** Screen y of a cloud's upper outline at `x` (Infinity where the cloud is absent). */
export function cloudTopAt(c: Cloud, x: number): number {
  let top = Math.abs(x - c.body[0]) <= c.body[2] ? c.body[1] - c.body[3] : Infinity;
  for (const [cx, cy, r] of c.circles) {
    const dx = Math.abs(x - cx);
    if (dx < r) top = Math.min(top, cy - Math.sqrt(r * r - dx * dx));
  }
  return top;
}
