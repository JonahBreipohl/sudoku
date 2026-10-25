import type { CandidateState } from "../candidates";
import { CELL_COUNT, DIGITS, PEERS, UNITS, digitBit, maskDigits, popcount, type Digit } from "../grid";
import { cellName, type Step } from "../step";
import { registerTechnique } from "./registry";

/*
 * A small alternating-inference chain (AIC) framework. Nodes are candidates, identified as
 * cell * 9 + (digit - 1). A strong link means at least one end is true (if one is false, the
 * other is true); a weak link means at most one end is true (if one is true, the other is false).
 * A chain that starts and ends with a strong link and alternates strong, weak, strong ... proves
 * that at least one of its two ends is true, by following "A false => next true => next false
 * ... => B true". Every strong link between two candidates of one digit in one unit is also a
 * weak link, so weak adjacency includes strong adjacency.
 *
 * Single-digit links (X-chains) and bivalue-cell links (XY-chains) both build this graph shape
 * and share one breadth-first search.
 */

export const NODE_COUNT = CELL_COUNT * 9;

export const nodeOf = (cell: number, digit: Digit): number => cell * 9 + digit - 1;
export const nodeCell = (node: number): number => Math.floor(node / 9);
export const nodeDigit = (node: number): Digit => ((node % 9) + 1) as Digit;

/** Adjacency lists indexed by node id, each sorted ascending so searches are deterministic. */
export interface LinkGraph {
  readonly strong: readonly (readonly number[])[];
  readonly weak: readonly (readonly number[])[];
}

/** Links longer than this are not searched; keeps the finder bounded and chains readable. */
export const MAX_CHAIN_LINKS = 11;

const SEES: readonly ReadonlySet<number>[] = PEERS.map((peers) => new Set(peers));
const sees = (a: number, b: number): boolean => SEES[a]!.has(b);

const hasDigit = (state: CandidateState, cell: number, bit: number): boolean =>
  state.values[cell] === 0 && ((state.candidates[cell] ?? 0) & bit) !== 0;

const addSorted = (list: number[], value: number): void => {
  if (list.includes(value)) return;
  list.push(value);
  list.sort((x, y) => x - y);
};

/**
 * Single-digit links: strong between the only two cells of a unit that can hold the digit
 * (a conjugate pair), weak between any two cells holding the digit that see each other.
 */
export function buildDigitLinks(state: CandidateState, digit: Digit): LinkGraph {
  const bit = digitBit(digit);
  const strong: number[][] = Array.from({ length: NODE_COUNT }, () => []);
  const weak: number[][] = Array.from({ length: NODE_COUNT }, () => []);
  const holders: number[] = [];
  for (let c = 0; c < CELL_COUNT; c++) if (hasDigit(state, c, bit)) holders.push(c);

  for (const unit of UNITS) {
    const inUnit = unit.filter((c) => hasDigit(state, c, bit));
    if (inUnit.length !== 2) continue;
    const [a, b] = inUnit as [number, number];
    addSorted(strong[nodeOf(a, digit)]!, nodeOf(b, digit));
    addSorted(strong[nodeOf(b, digit)]!, nodeOf(a, digit));
  }
  for (const a of holders) {
    // holders is ascending, so pushing in order keeps each list sorted.
    for (const b of holders) if (a !== b && sees(a, b)) weak[nodeOf(a, digit)]!.push(nodeOf(b, digit));
  }
  return { strong, weak };
}

/**
 * Shortest alternating chains from start: breadth-first over (node, next link type) states, so
 * every returned chain begins and ends with a strong link and has an odd number of links, at
 * most maxLinks. Returns one chain (node list, start first) per reachable end node, ordered by
 * length and then end id. A shortest walk that revisits a node is dropped rather than shown,
 * since such a chain would be confusing to read; this can only miss chains, never invent one.
 */
export function shortestChains(graph: LinkGraph, start: number, maxLinks = MAX_CHAIN_LINKS): number[][] {
  // State index: node * 2 + (1 when the last link was strong, so the next must be weak).
  const parent = new Int32Array(NODE_COUNT * 2).fill(-2);
  const depth = new Int32Array(NODE_COUNT * 2);
  const startState = start * 2;
  parent[startState] = -1;
  const queue = [startState];
  const ends: number[] = [];

  for (let i = 0; i < queue.length; i++) {
    const state = queue[i]!;
    const node = state >> 1;
    const afterStrong = (state & 1) === 1;
    const d = depth[state]!;
    if (afterStrong && node !== start) ends.push(state);
    if (d >= maxLinks) continue;
    const next = afterStrong ? graph.weak[node]! : graph.strong[node]!;
    for (const n of next) {
      const ns = n * 2 + (afterStrong ? 0 : 1);
      if (parent[ns] !== -2) continue;
      parent[ns] = state;
      depth[ns] = d + 1;
      queue.push(ns);
    }
  }

  const chains: number[][] = [];
  for (const end of ends) {
    const nodes: number[] = [];
    for (let s = end; s !== -1; s = parent[s]!) nodes.push(s >> 1);
    nodes.reverse();
    if (new Set(nodes).size === nodes.length) chains.push(nodes);
  }
  // BFS order already sorts by length; break ties by end node for a stable order.
  return chains.sort((a, b) => a.length - b.length || a[a.length - 1]! - b[b.length - 1]!);
}

/** "r1c1 = r1c5 - r4c5 = r4c8": = marks a strong link, - a weak one. */
export function formatChain(cells: readonly number[]): string {
  return cells.map((c, i) => (i === 0 ? cellName(c) : `${i % 2 === 1 ? "=" : "-"} ${cellName(c)}`)).join(" ");
}

interface XChainCandidate {
  digit: Digit;
  cells: number[];
  eliminations: { cell: number; digit: Digit }[];
}

/**
 * X-chain: a single-digit alternating chain whose two ends cannot both be false, so the digit
 * goes from every cell that sees both ends. Chains need at least three links (one link is a
 * conjugate pair, which locked candidates already covers).
 *
 * Returns the shortest chain with an elimination across all digits; ties go to the lower digit,
 * then the lower start cell, then the lower end cell. Each chain is reported once, from its
 * lower end. cells lists the chain in order from start to end.
 */
export function findXChain(state: CandidateState): Step | null {
  let best: XChainCandidate | null = null;

  for (const digit of DIGITS) {
    const bit = digitBit(digit);
    const graph = buildDigitLinks(state, digit);
    for (let start = 0; start < CELL_COUNT; start++) {
      const startNode = nodeOf(start, digit);
      if (graph.strong[startNode]!.length === 0) continue;
      const limit: number = best ? best.cells.length - 1 : MAX_CHAIN_LINKS;
      for (const nodes of shortestChains(graph, startNode, limit)) {
        const links = nodes.length - 1;
        if (links < 3) continue;
        if (best && links >= best.cells.length - 1) break;
        const cells: number[] = nodes.map(nodeCell);
        const a = cells[0]!;
        const b = cells[cells.length - 1]!;
        if (b < a) continue;
        const eliminations: { cell: number; digit: Digit }[] = [];
        for (let c = 0; c < CELL_COUNT; c++) {
          if (c !== a && c !== b && hasDigit(state, c, bit) && sees(c, a) && sees(c, b)) eliminations.push({ cell: c, digit });
        }
        if (eliminations.length === 0) continue;
        best = { digit, cells, eliminations };
        break;
      }
    }
  }
  if (!best) return null;

  const { digit, cells, eliminations } = best;
  const a = cells[0]!;
  const b = cells[cells.length - 1]!;
  return {
    technique: "x-chain",
    placements: [],
    eliminations,
    cells,
    digits: [digit],
    explanation:
      `X-Chain on ${digit}: ${formatChain(cells)}; one of ${cellName(a)} and ${cellName(b)} must be ${digit}, ` +
      `so remove ${digit} from ${eliminations.map((e) => cellName(e.cell)).join(", ")}`,
  };
}

/**
 * Bivalue links: strong between the two candidates of a cell with exactly two candidates (if one
 * is false the other is true), weak between equal digits in two bivalue cells that see each
 * other. Only bivalue cells get nodes, so every chain through this graph is an XY-chain.
 */
export function buildBivalueLinks(state: CandidateState): LinkGraph {
  const strong: number[][] = Array.from({ length: NODE_COUNT }, () => []);
  const weak: number[][] = Array.from({ length: NODE_COUNT }, () => []);
  const bivalue: number[] = [];
  for (let c = 0; c < CELL_COUNT; c++) {
    if (state.values[c] === 0 && popcount(state.candidates[c] ?? 0) === 2) bivalue.push(c);
  }
  for (const a of bivalue) {
    const [x, y] = maskDigits(state.candidates[a] ?? 0) as [Digit, Digit];
    strong[nodeOf(a, x)]!.push(nodeOf(a, y));
    strong[nodeOf(a, y)]!.push(nodeOf(a, x));
    // bivalue is ascending, so pushing in order keeps each list sorted.
    for (const b of bivalue) {
      if (a === b || !sees(a, b)) continue;
      const shared = (state.candidates[a] ?? 0) & (state.candidates[b] ?? 0);
      for (const d of maskDigits(shared)) weak[nodeOf(a, d)]!.push(nodeOf(b, d));
    }
  }
  return { strong, weak };
}

/** "r1c1 (1=2) - r1c5 (2=3) - r4c5 (3=1)": each cell with the digit it gives up and the one it is forced to. */
export function formatXYChain(nodes: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i + 1 < nodes.length; i += 2) {
    parts.push(`${cellName(nodeCell(nodes[i]!))} (${nodeDigit(nodes[i]!)}=${nodeDigit(nodes[i + 1]!)})`);
  }
  return parts.join(" - ");
}

/**
 * XY-chain: a path of bivalue cells, each seeing the next and sharing the digit that links them.
 * If the first cell is not d it is its other digit, which forces the next cell off that digit,
 * and so on down the chain until the last cell is d; so one of the two end cells is d, and d goes
 * from every cell that sees both ends. Chains need at least three cells (two cells with the
 * same pair are a naked pair).
 *
 * Returns the shortest chain with an elimination; ties go to the lower digit, then the lower
 * start cell, then the lower end cell. Each chain is reported once, from its lower end. cells
 * lists the chain's cells in order from start to end, each once.
 */
export function findXYChain(state: CandidateState): Step | null {
  const graph = buildBivalueLinks(state);
  let best: { digit: Digit; nodes: number[]; eliminations: { cell: number; digit: Digit }[] } | null = null;

  for (const digit of DIGITS) {
    const bit = digitBit(digit);
    for (let start = 0; start < CELL_COUNT; start++) {
      const startNode = nodeOf(start, digit);
      if (graph.strong[startNode]!.length === 0) continue;
      const limit: number = best ? best.nodes.length - 1 : MAX_CHAIN_LINKS;
      for (const nodes of shortestChains(graph, startNode, limit)) {
        const links = nodes.length - 1;
        if (links < 5) continue;
        if (best && links >= best.nodes.length - 1) break;
        const end = nodes[nodes.length - 1]!;
        const b = nodeCell(end);
        if (nodeDigit(end) !== digit || b < start) continue;
        const eliminations: { cell: number; digit: Digit }[] = [];
        for (let c = 0; c < CELL_COUNT; c++) {
          if (c !== start && c !== b && hasDigit(state, c, bit) && sees(c, start) && sees(c, b)) eliminations.push({ cell: c, digit });
        }
        if (eliminations.length === 0) continue;
        best = { digit, nodes, eliminations };
        break;
      }
    }
  }
  if (!best) return null;

  const { digit, nodes, eliminations } = best;
  const cells = nodes.filter((_, i) => i % 2 === 0).map(nodeCell);
  const a = cells[0]!;
  const b = cells[cells.length - 1]!;
  return {
    technique: "xy-chain",
    placements: [],
    eliminations,
    cells,
    digits: [digit],
    explanation:
      `XY-Chain on ${digit}: ${formatXYChain(nodes)}; one of ${cellName(a)} and ${cellName(b)} must be ${digit}, ` +
      `so remove ${digit} from ${eliminations.map((e) => cellName(e.cell)).join(", ")}`,
  };
}

// Level and weight come from TECHNIQUES in step.ts (Master: X-Chain 60, XY-Chain 70).
registerTechnique("x-chain", findXChain);
registerTechnique("xy-chain", findXYChain);
