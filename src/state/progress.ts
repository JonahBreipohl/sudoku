import type { GameRecord } from "./events";

/**
 * True when leaving this game would throw away player work. Nodes stay in the record after an
 * undo, so a fully undone game still counts; a submitted game is already archived and does not.
 */
export function hasProgress(record: Pick<GameRecord, "status" | "nodes">): boolean {
  return record.status === "playing" && record.nodes.length > 0;
}
