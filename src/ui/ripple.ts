/** Stagger per Chebyshev ring of the completion ripple. */
export const RIPPLE_STEP_MS = 45;
/** How long the result dialog waits so the ripple is seen first (farthest ring 8 * 45 + 500 ms animation, trimmed). */
export const RIPPLE_DIALOG_DELAY_MS = 900;

/** Chebyshev distance between two cells of a 9x9 grid (index = row * 9 + col). */
export function chebyshev(a: number, b: number): number {
  return Math.max(Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), Math.abs((a % 9) - (b % 9)));
}

/** Ring number of every cell from `origin`; the CSS multiplies it by the step for the delay. */
export function rippleRings(origin: number): number[] {
  return Array.from({ length: 81 }, (_, i) => chebyshev(i, origin));
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
