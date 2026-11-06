import { clamp, rng, type Pt, type Rect, type View } from "./geom";

/** A unit gust lasts this long from the placement to the last petal gone. */
export const GUST_MS = 2500;
/** The solve storm. */
export const STORM_MS = 4000;
/** More petals than this never fly at once (the instanced mesh's capacity). */
export const MAX_PETALS = 260;

export type BurstKind = "gust" | "storm";

/** One petal's whole flight, in CSS px and seconds; its pose at any time is a closed form. */
export interface Petal {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  /** Steady fall speed (px/s) once the push has died away. */
  fall: number;
  delay: number;
  life: number;
  size: number;
  /** Unit axis the petal flips around, so it thins out edge-on as it turns. */
  axis: [number, number, number];
  spin: number;
  phase: number;
  sway: number;
  swayHz: number;
  tone: number;
}

export interface PetalPose {
  x: number;
  y: number;
  angle: number;
  alpha: number;
}

/** How fast the initial push decays (1/s). */
const DRAG = 2.4;
/** Everything drifts a little to the right, as if the breeze has one direction. */
const WIND = 46;
const FADE_IN = 0.12;
/** The last share of each petal's life fades out, so it settles rather than pops. */
const FADE_OUT = 0.35;

export const burstMs = (kind: BurstKind) => (kind === "gust" ? GUST_MS : STORM_MS);

/** Position and opacity at `t` seconds after the burst began; null before it appears and after it settles. */
export function petalPose(p: Petal, t: number): PetalPose | null {
  const tau = t - p.delay;
  if (tau < 0 || tau >= p.life) return null;
  const push = (1 - Math.exp(-DRAG * tau)) / DRAG;
  const w = 2 * Math.PI * p.swayHz;
  const x = p.x0 + p.vx * push + WIND * tau + p.sway * (Math.sin(w * tau + p.phase) - Math.sin(p.phase));
  const y = p.y0 + p.vy * push + p.fall * tau;
  const fadeIn = clamp(tau / FADE_IN, 0, 1);
  const fadeOut = clamp((p.life - tau) / (p.life * FADE_OUT), 0, 1);
  return { x, y, angle: p.phase + p.spin * tau, alpha: Math.min(fadeIn, fadeOut) };
}

function axis(rand: () => number): [number, number, number] {
  // Mostly tumbling about an in-plane axis: that is what makes a petal flash and vanish edge-on.
  const a = rand() * Math.PI * 2;
  const z = 0.35 + rand() * 0.45;
  const k = Math.sqrt(1 - z * z);
  return [Math.cos(a) * k, Math.sin(a) * k, z];
}

const sizeScale = (view: View) => clamp(Math.min(view.w, view.h) / 760, 0.75, 1.5);

function petal(rand: () => number, x0: number, y0: number, vx: number, vy: number, fall: number, delay: number, life: number, scale: number): Petal {
  return {
    x0,
    y0,
    vx,
    vy,
    fall,
    delay,
    life,
    size: (20 + rand() * 10) * scale,
    axis: axis(rand),
    spin: (rand() < 0.5 ? -1 : 1) * (3 + rand() * 5),
    phase: rand() * Math.PI * 2,
    sway: (8 + rand() * 22) * scale,
    swayHz: 0.5 + rand() * 0.8,
    tone: rand(),
  };
}

/**
 * A short gust out of a completed row, column or box. Petals start inside the unit (hidden by the
 * opaque board) and are pushed outward from the board's centre, leaning toward the roomiest free
 * side of the screen so they are seen.
 */
export function planGust(unit: Rect, board: Rect, view: View, seed: number): Petal[] {
  const rand = rng(seed);
  const scale = sizeScale(view);
  const n = Math.round(clamp(24 + (view.w * view.h) / 90000, 26, 44));
  const ucx = unit.x + unit.w / 2;
  const ucy = unit.y + unit.h / 2;
  const bcx = board.x + board.w / 2;
  const bcy = board.y + board.h / 2;
  const free = {
    x: (view.w - board.x - board.w) - board.x,
    y: (view.h - board.y - board.h) - board.y,
  };
  // Normalised by the screen, so a lopsided layout (a phone's band under the board) pulls hard
  // and a centred desktop board barely at all.
  const fm = Math.max(view.w, view.h) * 0.5;
  const span = Math.max(board.w, board.h);
  const out: Petal[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = unit.x + rand() * unit.w;
    const y0 = unit.y + rand() * unit.h;
    let dx = ucx - bcx + (x0 - ucx) * 0.6;
    let dy = ucy - bcy + (y0 - ucy) * 0.6;
    const m = Math.hypot(dx, dy);
    if (m < span * 0.08) {
      const a = rand() * Math.PI * 2;
      dx = Math.cos(a);
      dy = Math.sin(a);
    } else {
      dx /= m;
      dy /= m;
    }
    dx += (free.x / fm) * 1.2 + (rand() - 0.5) * 0.7;
    dy += (free.y / fm) * 1.2 + (rand() - 0.5) * 0.7;
    const dm = Math.hypot(dx, dy) || 1;
    // Fast enough to clear the opaque board in a few tenths of a second, then the drag lets go.
    const speed = span * (2.2 + rand() * 1.4);
    const delay = rand() * 0.22;
    const life = GUST_MS / 1000 - delay - rand() * 0.35;
    out.push(petal(rand, x0, y0, (dx / dm) * speed, (dy / dm) * speed, 40 + rand() * 50, delay, life, scale));
  }
  return out;
}

/** The solve storm: petals torn from every blossom cluster plus a sheet blown in from the top-left. */
export function planStorm(sources: readonly Pt[], view: View, seed: number): Petal[] {
  const rand = rng(seed);
  const scale = sizeScale(view);
  const n = Math.round(clamp((view.w * view.h) / 9000, 80, 180));
  const out: Petal[] = [];
  for (let i = 0; i < n; i++) {
    const fromTree = sources.length > 0 && i % 2 === 0;
    let x0: number;
    let y0: number;
    if (fromTree) {
      const [sx, sy] = sources[Math.floor(rand() * sources.length)] ?? [0, 0];
      x0 = sx + (rand() - 0.5) * 40 * scale;
      y0 = sy + (rand() - 0.5) * 30 * scale;
    } else if (rand() < 0.6) {
      x0 = rand() * view.w * 0.9 - view.w * 0.1;
      y0 = -20 - rand() * 60;
    } else {
      x0 = -20 - rand() * 60;
      y0 = rand() * view.h * 0.8;
    }
    const delay = rand() * 1.5;
    const life = STORM_MS / 1000 - delay - rand() * 0.4;
    const speed = (0.18 + rand() * 0.3) * Math.max(view.w, view.h);
    const a = -0.25 + rand() * 0.75; // mostly rightward, some lifting, some diving
    out.push(petal(rand, x0, y0, Math.cos(a) * speed, Math.sin(a) * speed, 70 + rand() * 90, delay, life, scale));
  }
  return out;
}
