import { useEffect, useState } from "react";

/** Epoch ms, refreshed once per second on the second boundary while `active`. */
export function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      setNow(Date.now());
      id = setTimeout(schedule, 1000 - (Date.now() % 1000) + 5);
    };
    schedule();
    return () => clearTimeout(id);
  }, [active]);
  return now;
}
