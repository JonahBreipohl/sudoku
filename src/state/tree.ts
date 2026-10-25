// Pure operations on the append-only event tree and its cursor (docs/ARCHITECTURE.md,
// "Board events"). Nothing here ever removes a node: undo and rewind only move the cursor,
// so a new move after them starts a branch and the old nodes stay for analysis.

import type { BoardEvent } from "./events";

export interface Tree {
  nodes: readonly BoardEvent[];
  /** Id of the current node, -1 = the starting position. */
  cursor: number;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
/** A board event before the tree assigns its id and parent. */
export type NewBoardEvent = DistributiveOmit<BoardEvent, "id" | "parent">;

/** Adds `event` as a child of the cursor and moves the cursor to it. */
export function append(tree: Tree, event: NewBoardEvent): Tree {
  const id = tree.nodes.length;
  const node = { ...event, id, parent: tree.cursor } as BoardEvent;
  return { nodes: [...tree.nodes, node], cursor: id };
}

/** Moves the cursor to its parent; a no-op at the starting position. */
export function undo(tree: Tree): Tree {
  if (tree.cursor < 0) return tree;
  return { nodes: tree.nodes, cursor: tree.nodes[tree.cursor]!.parent };
}

/** The most recently added child of `id` (-1 for the root), or -1 when it has none. */
export function latestChild(nodes: readonly BoardEvent[], id: number): number {
  // Ids grow with insertion order and a child's id exceeds its parent's, so scan from the end.
  for (let i = nodes.length - 1; i > id; i--)
    if (nodes[i]!.parent === id) return i;
  return -1;
}

/** Moves the cursor to the cursor's most recent child; a no-op at a leaf. */
export function redo(tree: Tree): Tree {
  const child = latestChild(tree.nodes, tree.cursor);
  return child < 0 ? tree : { nodes: tree.nodes, cursor: child };
}

/** Moves the cursor to any node (-1 = starting position). Throws on an unknown id. */
export function rewind(tree: Tree, nodeId: number): Tree {
  if (!Number.isInteger(nodeId) || nodeId < -1 || nodeId >= tree.nodes.length) {
    throw new RangeError(`rewind target ${nodeId} is not a node`);
  }
  return nodeId === tree.cursor ? tree : { nodes: tree.nodes, cursor: nodeId };
}

/** Events from the root to the cursor, in play order. */
export function path(tree: Tree): BoardEvent[] {
  const out: BoardEvent[] = [];
  for (let id = tree.cursor; id >= 0; id = tree.nodes[id]!.parent)
    out.push(tree.nodes[id]!);
  return out.reverse();
}
