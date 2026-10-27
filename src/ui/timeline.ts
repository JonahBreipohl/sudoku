// View model for the analysis timeline: step k is the position after the first k board events
// of the path, so step 0 is the starting position and step `length` is "now".

import type { BoardEvent } from "../state/events";
import { describeEvent } from "./moveHistory";

export function clampStep(step: number, length: number): number {
  return Math.max(0, Math.min(length, Math.round(step)));
}

/** "Move 37 of 112: r4c2 = 6", or the starting position at step 0. */
export function stepLabel(path: readonly BoardEvent[], step: number): string {
  const s = clampStep(step, path.length);
  if (s === 0) return `Starting position, before move 1 of ${path.length}`;
  return `Move ${s} of ${path.length}: ${describeEvent(path[s - 1]!)}`;
}

/** The step that shows the root mistake just made, or null when the path has none. */
export function mistakeStep(rootIndex: number | null | undefined, length: number): number | null {
  if (rootIndex === null || rootIndex === undefined || rootIndex < 0 || rootIndex >= length) return null;
  return rootIndex + 1;
}

/** Mistake marks belong to the root mistake, so earlier previewed positions must not show them. */
export function marksAtStep<T>(
  marks: T | undefined,
  rootIndex: number | null | undefined,
  length: number,
  step: number,
): T | undefined {
  const from = mistakeStep(rootIndex, length);
  return from !== null && step >= from ? marks : undefined;
}
