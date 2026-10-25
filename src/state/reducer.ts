// Pure derivation of {board, notes, conflicts} by replaying the root-to-cursor path of
// board events (docs/ARCHITECTURE.md, "Board events"). Givens are never writable.

import {
  PEERS,
  computeCandidates,
  digitBit,
  findConflicts,
  parseGrid,
  type CandidateMask,
  type CellValue,
  type Digit,
} from "../engine";
import type { BoardEvent } from "./events";

export interface BoardState {
  board: CellValue[];
  notes: CandidateMask[];
  conflicts: Set<number>;
}

/** Board and notes without conflicts: what a snapshot stores. */
interface Raw {
  board: CellValue[];
  notes: CandidateMask[];
}

export const SNAPSHOT_INTERVAL = 64;

function initial(givens: readonly CellValue[]): Raw {
  return { board: [...givens], notes: new Array<CandidateMask>(81).fill(0) };
}

function setValue(raw: Raw, cell: number, digit: Digit): void {
  raw.board[cell] = digit;
  raw.notes[cell] = 0;
  const bit = digitBit(digit);
  for (const peer of PEERS[cell]!) raw.notes[peer] = raw.notes[peer]! & ~bit;
}

/** Applies one event in place. Edits aimed at givens are ignored. */
function applyInPlace(raw: Raw, givens: readonly CellValue[], event: BoardEvent): void {
  switch (event.type) {
    case "place":
    case "hint-reveal":
      if (givens[event.cell] === 0) setValue(raw, event.cell, event.digit as Digit);
      break;
    case "erase":
      if (givens[event.cell] === 0) raw.board[event.cell] = 0;
      break;
    case "note": {
      // Notes only make sense on empty cells.
      if (raw.board[event.cell] !== 0) break;
      const bit = digitBit(event.digit as Digit);
      raw.notes[event.cell] = event.on ? raw.notes[event.cell]! | bit : raw.notes[event.cell]! & ~bit;
      break;
    }
    case "auto-notes": {
      const candidates = computeCandidates(raw.board);
      for (let cell = 0; cell < 81; cell++) raw.notes[cell] = raw.board[cell] === 0 ? candidates[cell]! : 0;
      break;
    }
    case "reset":
      raw.board = [...givens];
      raw.notes.fill(0);
      break;
  }
}

/** Applies a single event, returning a fresh state. */
export function applyBoardEvent(puzzle: string, state: BoardState, event: BoardEvent): BoardState {
  const givens = parseGrid(puzzle);
  const raw: Raw = { board: [...state.board], notes: [...state.notes] };
  applyInPlace(raw, givens, event);
  return { ...raw, conflicts: findConflicts(raw.board) };
}

export interface Replayer {
  /** State at `cursor` (-1 = starting position). Nodes are append-only, so snapshots stay valid. */
  derive(nodes: readonly BoardEvent[], cursor: number): BoardState;
}

/**
 * Replays paths for one puzzle. Remembers the state at every 64th node (ids 63, 127, ...)
 * so a later replay starts at the nearest snapshot on its path instead of the root.
 */
export function createReplayer(puzzle: string): Replayer {
  const givens = parseGrid(puzzle);
  const snapshots = new Map<number, Raw>();
  const copy = (r: Raw): Raw => ({ board: [...r.board], notes: [...r.notes] });

  return {
    derive(nodes, cursor) {
      const path: BoardEvent[] = [];
      let raw: Raw | null = null;
      for (let id = cursor; id >= 0; id = nodes[id]!.parent) {
        const snap = snapshots.get(id);
        if (snap) {
          raw = copy(snap);
          break;
        }
        path.push(nodes[id]!);
      }
      raw ??= initial(givens);
      for (let i = path.length - 1; i >= 0; i--) {
        const event = path[i]!;
        applyInPlace(raw, givens, event);
        if ((event.id + 1) % SNAPSHOT_INTERVAL === 0) snapshots.set(event.id, copy(raw));
      }
      return { ...raw, conflicts: findConflicts(raw.board) };
    },
  };
}

/** One-shot replay with no snapshot reuse. */
export function replayPath(puzzle: string, nodes: readonly BoardEvent[], cursor: number): BoardState {
  return createReplayer(puzzle).derive(nodes, cursor);
}
