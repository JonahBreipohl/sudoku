// Types and runtime validators for the event-sourced game record (docs/ARCHITECTURE.md,
// "Game state"). Validators exist because records come back from localStorage, where
// anything may have been written by an older build or by hand; persistence must be able
// to reject bad data instead of throwing.

import { LEVELS, type Level } from "../engine";

export const RECORD_VERSION = 1;

export type InputMethod = "keyboard" | "pad" | "digit-first";
export type HintTier = "nudge" | "technique" | "reveal";
export type GameSource = "bank" | "generated" | "daily" | "import";
export type GameStatus = "playing" | "submitted";

interface BoardEventBase {
  /** Index in `nodes`. */
  id: number;
  /** Parent node id, -1 for the starting position. */
  parent: number;
  at: number;
  /** Active play ms when it happened. */
  elapsed: number;
}

export type BoardEvent = BoardEventBase &
  (
    | { type: "place"; cell: number; digit: number; input: InputMethod; key?: string }
    | { type: "erase"; cell: number }
    | { type: "note"; cell: number; digit: number; on: boolean }
    | { type: "auto-notes" }
    | { type: "reset" }
    | { type: "hint-reveal"; cell: number; digit: number; step: string }
  );

export type MetaEvent = { at: number } & (
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "hidden" }
  | { type: "visible" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "rewind"; to: number }
  | { type: "check"; mistakes: number }
  | { type: "hint"; tier: HintTier; step: string }
  | { type: "settings-assist"; autoCandidates: boolean }
  | { type: "submit"; result: "solved" | "incorrect" }
);

export interface GameRecord {
  version: 1;
  id: string;
  puzzle: string;
  solution: string;
  level: Level;
  score: number;
  source: GameSource;
  createdAt: number;
  nodes: BoardEvent[];
  cursor: number;
  log: MetaEvent[];
  status: GameStatus;
}

const SOURCES: readonly string[] = ["bank", "generated", "daily", "import"];
const INPUTS: readonly string[] = ["keyboard", "pad", "digit-first"];
const TIERS: readonly string[] = ["nudge", "technique", "reveal"];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isCell = (v: unknown): v is number => isInt(v) && v >= 0 && v < 81;
const isDigit = (v: unknown): v is number => isInt(v) && v >= 1 && v <= 9;
const isStr = (v: unknown): v is string => typeof v === "string";
const isGridString = (v: unknown): v is string => isStr(v) && /^[0-9.]{81}$/.test(v);

export function isBoardEvent(v: unknown, index?: number): v is BoardEvent {
  if (!isObj(v)) return false;
  if (!isInt(v.id) || v.id < 0 || !isInt(v.parent) || v.parent < -1) return false;
  // Parent must precede the node, which keeps the tree acyclic.
  if (v.parent >= v.id) return false;
  if (index !== undefined && v.id !== index) return false;
  if (!isTime(v.at) || !isTime(v.elapsed)) return false;
  switch (v.type) {
    case "place":
      return (
        isCell(v.cell) &&
        isDigit(v.digit) &&
        isStr(v.input) &&
        INPUTS.includes(v.input) &&
        (v.key === undefined || isStr(v.key))
      );
    case "erase":
      return isCell(v.cell);
    case "note":
      return isCell(v.cell) && isDigit(v.digit) && typeof v.on === "boolean";
    case "auto-notes":
    case "reset":
      return true;
    case "hint-reveal":
      return isCell(v.cell) && isDigit(v.digit) && isStr(v.step);
    default:
      return false;
  }
}

export function isMetaEvent(v: unknown): v is MetaEvent {
  if (!isObj(v) || !isTime(v.at)) return false;
  switch (v.type) {
    case "start":
    case "pause":
    case "resume":
    case "hidden":
    case "visible":
    case "undo":
    case "redo":
      return true;
    case "rewind":
      return isInt(v.to) && v.to >= -1;
    case "check":
      return isInt(v.mistakes) && v.mistakes >= 0;
    case "hint":
      return isStr(v.tier) && TIERS.includes(v.tier) && isStr(v.step);
    case "settings-assist":
      return typeof v.autoCandidates === "boolean";
    case "submit":
      return v.result === "solved" || v.result === "incorrect";
    default:
      return false;
  }
}

export function isGameRecord(json: unknown): json is GameRecord {
  if (!isObj(json)) return false;
  if (json.version !== RECORD_VERSION) return false;
  if (!isStr(json.id) || json.id === "") return false;
  if (!isGridString(json.puzzle) || !isGridString(json.solution)) return false;
  if (!isStr(json.level) || !(LEVELS as readonly string[]).includes(json.level)) return false;
  if (typeof json.score !== "number" || !Number.isFinite(json.score)) return false;
  if (!isStr(json.source) || !SOURCES.includes(json.source)) return false;
  if (!isTime(json.createdAt)) return false;
  if (json.status !== "playing" && json.status !== "submitted") return false;
  const { nodes, log, cursor } = json;
  if (!Array.isArray(nodes) || !Array.isArray(log)) return false;
  if (!nodes.every((n, i) => isBoardEvent(n, i))) return false;
  if (!log.every(isMetaEvent)) return false;
  return isInt(cursor) && cursor >= -1 && cursor < nodes.length;
}
