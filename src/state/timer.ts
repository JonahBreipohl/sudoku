// Active play time derived from the meta log (docs/ARCHITECTURE.md, "Timer"). Pure: the
// caller supplies `now`, so tests and the e2e hook can inject a clock.

import type { GameRecord, MetaEvent } from "./events";

export interface TimerState {
  /** Active ms accumulated up to the last event. */
  elapsed: number;
  /** Epoch ms the clock last started running; null while stopped. */
  since: number | null;
}

// Pause and hidden are tracked separately: a tab hidden while the player had paused must
// not resume the clock when it becomes visible again.
export function foldTimer(log: readonly MetaEvent[]): TimerState & { running: boolean } {
  let elapsed = 0;
  let since: number | null = null;
  let started = false;
  let paused = false;
  let hidden = false;
  let done = false;
  for (const e of log) {
    switch (e.type) {
      case "start":
        started = true;
        break;
      case "pause":
        paused = true;
        break;
      case "resume":
        paused = false;
        break;
      case "hidden":
        hidden = true;
        break;
      case "visible":
        hidden = false;
        break;
      case "submit":
        done = true;
        break;
      default:
        continue;
    }
    const run = started && !paused && !hidden && !done;
    if (run && since === null) since = e.at;
    else if (!run && since !== null) {
      // Clamp so a clock that stepped backwards never reduces the total.
      elapsed += Math.max(0, e.at - since);
      since = null;
    }
  }
  return { elapsed, since, running: since !== null };
}

/** Active play ms at `now`: elapsed at the last stop plus the current running stretch. */
export function activeMs(record: Pick<GameRecord, "log">, now: number): number {
  const s = foldTimer(record.log);
  return s.since === null ? s.elapsed : s.elapsed + Math.max(0, now - s.since);
}

export function isRunning(record: Pick<GameRecord, "log">): boolean {
  return foldTimer(record.log).running;
}

export function isPaused(record: Pick<GameRecord, "log">): boolean {
  let paused = false;
  for (const e of record.log) {
    if (e.type === "pause") paused = true;
    else if (e.type === "resume") paused = false;
  }
  return paused;
}
