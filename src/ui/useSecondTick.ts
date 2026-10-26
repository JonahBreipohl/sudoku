import { useEffect, useState } from "react";

/** Ms until the next whole second, plus a small margin so the timeout never fires just before it. */
export function msToNextSecond(now: number): number {
  return 1000 - (now % 1000) + 5;
}

/**
 * Calls `onTick` now and then at each second boundary; returns a stop function.
 * A chained timeout (not an interval) so drift cannot accumulate and a throttled tab resyncs.
 */
export function startSecondTicker(onTick: (now: number) => void): () => void {
  let id: ReturnType<typeof setTimeout>;
  const tick = () => {
    const t = Date.now();
    onTick(t);
    id = setTimeout(tick, msToNextSecond(t));
  };
  tick();
  return () => clearTimeout(id);
}

/** Epoch ms, refreshed once per second on the second boundary while `active`. */
export function useSecondTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => (active ? startSecondTicker(setNow) : undefined), [active]);
  return now;
}
