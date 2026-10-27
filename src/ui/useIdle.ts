import { useEffect, useRef } from "react";

const ACTIVITY = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const;

/**
 * Calls `onIdle` once after `minutes` without input on `target`; returns a stop function.
 * Activity only stamps a timestamp and the single timer re-arms itself, so a stream of
 * pointermove events costs no timer churn.
 */
export function watchIdle(minutes: number, onIdle: () => void, target: EventTarget = window): () => void {
  const limit = minutes * 60_000;
  let last = Date.now();
  let id: ReturnType<typeof setTimeout>;
  const arm = (ms: number) => {
    id = setTimeout(() => {
      const left = limit - (Date.now() - last);
      if (left > 0) arm(left);
      else onIdle();
    }, ms);
  };
  const touch = () => {
    last = Date.now();
  };
  arm(limit);
  for (const t of ACTIVITY) target.addEventListener(t, touch, { passive: true });
  return () => {
    clearTimeout(id);
    for (const t of ACTIVITY) target.removeEventListener(t, touch);
  };
}

/** Runs `onIdle` after `minutes` without input while `active`; 0 minutes disables it. */
export function useIdle(minutes: number, active: boolean, onIdle: () => void): void {
  const cb = useRef(onIdle);
  useEffect(() => {
    cb.current = onIdle;
  });
  useEffect(() => {
    if (!active || minutes <= 0) return;
    return watchIdle(minutes, () => cb.current());
  }, [minutes, active]);
}
