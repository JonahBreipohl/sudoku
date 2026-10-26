// The game store (docs/ARCHITECTURE.md, "Game state"): owns the GameRecord, derives the
// board by replay, and logs undo/redo/rewind as meta events. UI state such as selection
// does not live here. The snapshot object is replaced only when something changed, so
// useSyncExternalStore consumers re-render only on real changes.

import { parseGrid, type CellValue } from "../engine";
import type { Level } from "../engine";
import {
  RECORD_VERSION,
  type BoardEvent,
  type GameRecord,
  type MetaEvent,
} from "./events";
import type { PersistenceAdapter } from "./persistence";
import { activeMs } from "./timer";
import { wrongCells } from "./check";
import { createReplayer, type BoardState } from "./reducer";
import { append, redo, rewind, undo, type NewBoardEvent, type Tree } from "./tree";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Board events as callers write them: the store stamps `at` and `elapsed`. */
export type BoardCommand = DistributiveOmit<NewBoardEvent, "at" | "elapsed">;
/** Meta events as callers write them: the store stamps `at`. */
export type MetaCommand = DistributiveOmit<MetaEvent, "at">;
/** Submit carries no result: the store compares the board with the solution itself. */
export type GameCommand = BoardCommand | Exclude<MetaCommand, { type: "submit" }> | { type: "submit" };

export interface GameSnapshot {
  record: GameRecord;
  givens: CellValue[];
  board: CellValue[];
  notes: BoardState["notes"];
  conflicts: Set<number>;
  canUndo: boolean;
  canRedo: boolean;
}

export interface GameStore {
  dispatch(command: GameCommand): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): GameSnapshot;
}

export interface StoreOptions {
  /** Epoch ms; injectable for tests. */
  now?: () => number;
  /** Active play ms; defaults to the log-derived timer at `now`. */
  elapsed?: () => number;
  /** When given, the record is saved after every change. */
  persistence?: PersistenceAdapter;
}

const BOARD_TYPES: ReadonlySet<string> = new Set([
  "place",
  "erase",
  "note",
  "auto-notes",
  "reset",
  "hint-reveal",
]);

export function newGameRecord(args: {
  id: string;
  puzzle: string;
  solution: string;
  level: Level;
  score?: number;
  source?: GameRecord["source"];
  createdAt: number;
}): GameRecord {
  return {
    version: RECORD_VERSION,
    id: args.id,
    puzzle: args.puzzle,
    solution: args.solution,
    level: args.level,
    score: args.score ?? 0,
    source: args.source ?? "bank",
    createdAt: args.createdAt,
    nodes: [],
    cursor: -1,
    log: [],
    status: "playing",
  };
}

/** Wrong entries and blanks, for the "incorrect" result screen. */
export function submitErrors(record: Pick<GameRecord, "puzzle" | "solution">, board: readonly CellValue[]) {
  return { wrong: wrongCells(record.puzzle, record.solution, board).length, blank: board.filter((v) => v === 0).length };
}

export function createGameStore(initial: GameRecord, options: StoreOptions = {}): GameStore {
  const now = options.now ?? Date.now;
  let current = initial;
  const elapsed = options.elapsed ?? (() => activeMs(current, now()));
  // One Replayer per game so its snapshots are reused across dispatches.
  const replayer = createReplayer(initial.puzzle);
  const givens = parseGrid(initial.puzzle);
  const listeners = new Set<() => void>();

  const snapshotOf = (record: GameRecord): GameSnapshot => {
    const state = replayer.derive(record.nodes, record.cursor);
    const tree: Tree = record;
    return {
      record,
      givens,
      board: state.board,
      notes: state.notes,
      conflicts: state.conflicts,
      canUndo: record.cursor >= 0,
      canRedo: redo(tree) !== tree,
    };
  };

  let snapshot = snapshotOf(initial);

  const commit = (record: GameRecord) => {
    current = record;
    snapshot = snapshotOf(record);
    const p = options.persistence;
    if (p) {
      if (record.status === "submitted") {
        p.archive(record);
        p.clearCurrent();
      } else p.saveCurrent(record);
    }
    for (const l of [...listeners]) l();
  };

  /** True when the command would not change the board, so no event is logged. */
  const isNoop = (c: BoardCommand): boolean => {
    switch (c.type) {
      case "place":
        return givens[c.cell] !== 0 || snapshot.board[c.cell] === c.digit;
      case "erase":
        return givens[c.cell] !== 0 || snapshot.board[c.cell] === 0;
      case "note": {
        if (snapshot.board[c.cell] !== 0) return true;
        const has = (snapshot.notes[c.cell]! & (1 << (c.digit - 1))) !== 0;
        return has === c.on;
      }
      case "hint-reveal":
        return givens[c.cell] !== 0 || snapshot.board[c.cell] === c.digit;
      case "reset":
        return (
          snapshot.board.every((v, i) => v === givens[i]) && snapshot.notes.every((m) => m === 0)
        );
      default:
        return false;
    }
  };

  const isSolved = (board: readonly CellValue[]) =>
    board.every((v, i) => String(v) === initial.solution[i]);

  const submit = (record: GameRecord, at: number) => {
    const result = isSolved(snapshot.board) ? "solved" : "incorrect";
    commit({
      ...record,
      status: "submitted",
      log: [...record.log, { type: "submit", result, at }],
    });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispatch(command) {
      const record = snapshot.record;
      // A submitted game is final; this also makes auto-submit and a manual submit race-free.
      // The one exception is rewind: analysis reopens a submitted game on a new branch.
      const reopening = record.status === "submitted" && command.type === "rewind";
      if (record.status === "submitted" && !reopening) return;
      const at = now();
      if (command.type === "submit") {
        submit(record, at);
        return;
      }
      if (BOARD_TYPES.has(command.type)) {
        const c = command as BoardCommand;
        if (isNoop(c)) return;
        const tree = append(record, { ...c, at, elapsed: elapsed() } as NewBoardEvent);
        commit({ ...record, nodes: tree.nodes as BoardEvent[], cursor: tree.cursor });
        // A full, correct grid submits itself, once: the status guard above blocks repeats.
        if (isSolved(snapshot.board)) submit(snapshot.record, at);
        return;
      }
      const meta = command as Exclude<MetaCommand, { type: "submit" }>;
      let tree: Tree = record;
      if (meta.type === "undo") tree = undo(record);
      else if (meta.type === "redo") tree = redo(record);
      else if (meta.type === "rewind") {
        // A stale or bogus target is ignored rather than crashing the caller.
        if (!Number.isInteger(meta.to) || meta.to < -1 || meta.to >= record.nodes.length) return;
        tree = rewind(record, meta.to);
      }
      // Cursor moves that go nowhere are not history.
      if (
        (meta.type === "undo" || meta.type === "redo" || meta.type === "rewind") &&
        tree.cursor === record.cursor &&
        !reopening
      )
        return;
      commit({
        ...record,
        status: reopening ? "playing" : record.status,
        cursor: tree.cursor,
        log: [...record.log, { ...meta, at } as MetaEvent],
      });
    },
  };
}
