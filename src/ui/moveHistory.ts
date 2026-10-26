// Pure view model for the move history list (docs/ARCHITECTURE.md, "Board events"): the path
// from the root to the cursor, plus the redo chain beyond it, which undo left "not current".

import type { BoardEvent } from "../state/events";
import { latestChild } from "../state/tree";

export interface HistoryEntry {
  id: number;
  /** 1-based position along the displayed line of play. */
  step: number;
  text: string;
  /** Beyond the cursor: undone, and redo would bring it back. */
  undone: boolean;
  /** The node the cursor sits on. */
  current: boolean;
  /** Another branch also grows from this node: a rewind (or undo) led away from it. */
  branchPoint: boolean;
}

/** Number of nodes whose parent is `parent` (-1 = the starting position). */
function childCount(nodes: readonly BoardEvent[], parent: number): number {
  let n = 0;
  for (const e of nodes) if (e.parent === parent) n++;
  return n;
}

/** True when more than one line of play starts from the empty starting position. */
export function branchesAtStart(nodes: readonly BoardEvent[]): boolean {
  return childCount(nodes, -1) > 1;
}

export function cellName(cell: number): string {
  return `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;
}

export function describeEvent(e: BoardEvent): string {
  switch (e.type) {
    case "place":
      return `${cellName(e.cell)} = ${e.digit}`;
    case "erase":
      return `${cellName(e.cell)} erased`;
    case "note":
      return `${cellName(e.cell)} note ${e.digit} ${e.on ? "added" : "removed"}`;
    case "auto-notes":
      return "Auto-notes filled";
    case "reset":
      return "Board reset";
    case "hint-reveal":
      return `${cellName(e.cell)} = ${e.digit} (hint)`;
  }
}

/**
 * Newest first. The redo chain follows the same child redo would pick, so what is listed as
 * undone is exactly what Redo restores; older abandoned branches stay in the record only.
 */
export function historyEntries(nodes: readonly BoardEvent[], cursor: number): HistoryEntry[] {
  const line: { event: BoardEvent; undone: boolean }[] = [];
  for (let id = cursor; id >= 0; id = nodes[id]!.parent) line.push({ event: nodes[id]!, undone: false });
  line.reverse();
  for (let id = latestChild(nodes, cursor); id >= 0; id = latestChild(nodes, id))
    line.push({ event: nodes[id]!, undone: true });
  return line
    .map(({ event, undone }, i) => ({
      id: event.id,
      step: i + 1,
      text: describeEvent(event),
      undone,
      current: event.id === cursor,
      branchPoint: childCount(nodes, event.id) > 1,
    }))
    .reverse();
}
