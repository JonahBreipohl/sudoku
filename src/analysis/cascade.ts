// The moves that depended on the root mistake (docs/ARCHITECTURE.md, "Mistake analysis", step 5).
//
// Walk the path after the root keeping the set of wrong cells that trace back to it. A later move
// belongs to the cascade when a peer in that set holds the solution digit of the move's cell, so
// the error hid the truth there: a placement (right or wrong), or a mistaken note removal (which
// diagnose() calls a "consequence"). Requiring the peer to be in the set, rather than any wrong
// cell, keeps an independent second mistake and its own fallout out of the root's cascade.

import { PEERS, type CellValue, type Digit } from "../engine";
import type { Mistake, MistakeScan } from "./mistakes";

export interface CascadeMove {
  /** Node id of the event in `record.nodes`. */
  eventId: number;
  /** Position of the event on the replayed path. */
  index: number;
  cell: number;
  /** The digit placed, or the note digit turned off. */
  digit: Digit;
  /** "placement" for a place or hint-reveal; "note" for a mistaken note removal. */
  move: "placement" | "note";
  /** Whether the move itself was a mistake (a wrong placement or a removed solution note). */
  wrong: boolean;
  /** The cascade cell whose wrong value hid this cell's solution digit. */
  dependsOn: number;
}

/** The later moves that depend on `root`, in play order. Does not modify its inputs. */
export function findCascade(scan: MistakeScan, root: Mistake): CascadeMove[] {
  const { solution, path, states } = scan.replay;
  const mistakeAt = new Map(scan.mistakes.map((m) => [m.index, m]));
  const isWrong = (board: readonly CellValue[], cell: number) => board[cell] !== 0 && board[cell] !== solution[cell];

  // The wrong cells descending from the root. A removed solution note leaves no wrong value, so
  // only a later wrong placement in the same cell can carry it forward.
  const wrongCells = new Set<number>(root.kind === "wrong-placement" ? [root.cell] : []);
  const out: CascadeMove[] = [];

  for (let index = root.index + 1; index < path.length; index++) {
    const event = path[index]!;
    const board = states[index]!.board;
    // A cell erased, corrected or wiped by a reset no longer hides anything.
    for (const c of wrongCells) if (!isWrong(board, c)) wrongCells.delete(c);

    if (event.type !== "place" && event.type !== "hint-reveal" && event.type !== "note") continue;
    const cell = event.cell;
    // The reducer ignores edits to givens.
    if (scan.replay.givens[cell] !== 0) continue;
    const mistake = mistakeAt.get(index);
    if (event.type === "note" && !mistake) continue;

    let dependsOn = PEERS[cell]!.find((p) => wrongCells.has(p) && board[p] === solution[cell]);
    if (
      dependsOn === undefined &&
      root.kind === "removed-solution-note" &&
      mistake?.kind === "wrong-placement" &&
      cell === root.cell
    ) {
      dependsOn = root.cell;
    }

    if (dependsOn !== undefined) {
      out.push({
        eventId: event.id,
        index,
        cell,
        digit: event.digit as Digit,
        move: event.type === "note" ? "note" : "placement",
        wrong: mistake !== undefined,
        dependsOn,
      });
      if (mistake?.kind === "wrong-placement") wrongCells.add(cell);
      else if (event.type !== "note") wrongCells.delete(cell);
    } else if (event.type !== "note") {
      // Overwritten by a move outside the cascade: whatever is there now is not the root's doing.
      wrongCells.delete(cell);
    }
  }
  return out;
}
