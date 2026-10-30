// Light haptics for phones. navigator.vibrate is missing on iOS Safari and meaningless with a
// mouse, so every call is a silent no-op unless the API exists, the primary pointer is coarse
// and the setting is on. Patterns are short on purpose: feedback, not buzzing.

export type HapticEvent = "place" | "conflict" | "unit" | "solve";

export const HAPTIC_PATTERNS: Readonly<Record<HapticEvent, number | number[]>> = {
  place: 8,
  conflict: [15, 40, 15],
  unit: [10, 30, 10, 30, 10],
  solve: [20, 40, 20, 40, 20, 40, 60],
};

export interface HapticEnv {
  vibrate?: (pattern: number | number[]) => boolean;
  coarsePointer: () => boolean;
}

function browserEnv(): HapticEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    vibrate: typeof nav?.vibrate === "function" ? (p) => nav.vibrate(p) : undefined,
    coarsePointer: () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
  };
}

/** Returns true when a pattern was sent. Never throws. */
export function haptic(event: HapticEvent, enabled: boolean, env: HapticEnv = browserEnv()): boolean {
  if (!enabled || !env.vibrate) return false;
  try {
    if (!env.coarsePointer()) return false;
    return env.vibrate(HAPTIC_PATTERNS[event]);
  } catch {
    return false;
  }
}
