import { useMemo } from "react";

export const DRIFT_STEP_MS = 5 * 60 * 1000;
export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 7;

/** A fixed walk of small offsets (px) so no pixel stays lit for long; max magnitude 6. */
const PATH: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [4, -3],
  [-3, 5],
  [6, 2],
  [-5, -4],
  [2, 6],
  [-6, 1],
  [3, -6],
];

/** Offset for the drift slot containing `now`; changes only once per DRIFT_STEP_MS. */
export function driftOffset(now: number): { dx: number; dy: number } {
  const slot = Math.floor(now / DRIFT_STEP_MS);
  const [dx, dy] = PATH[((slot % PATH.length) + PATH.length) % PATH.length] ?? [0, 0];
  return { dx, dy };
}

/** True from 22:00 up to (not including) 07:00 local time. */
export function isNight(now: number): boolean {
  const h = new Date(now).getHours();
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

/** Drift and dim state derived from the existing once-a-second tick; no timers of its own. */
export function useDrift(now: number): { dx: number; dy: number; night: boolean } {
  const { dx, dy } = useMemo(() => driftOffset(now), [now]);
  return { dx, dy, night: isNight(now) };
}
