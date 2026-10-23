// Grid model shared by every engine module.
// A grid is 81 cells in row-major order (index = row * 9 + col); 0 means empty.

export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type CellValue = 0 | Digit;
export type Grid = readonly CellValue[];

/** Candidate set for one cell: bit (d - 1) is set when digit d is possible. */
export type CandidateMask = number;

export const CELL_COUNT = 81;
export const ALL_CANDIDATES: CandidateMask = 0x1ff;
export const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const rowOf = (cell: number): number => Math.floor(cell / 9);
export const colOf = (cell: number): number => cell % 9;
export const boxOf = (cell: number): number => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
export const cellIndex = (row: number, col: number): number => row * 9 + col;

function buildUnits(): readonly (readonly number[])[] {
  const rows = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => cellIndex(r, c)));
  const cols = Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => cellIndex(r, c)));
  const boxes = Array.from({ length: 9 }, (_, b) =>
    Array.from({ length: 9 }, (_, i) =>
      cellIndex(Math.floor(b / 3) * 3 + Math.floor(i / 3), (b % 3) * 3 + (i % 3)),
    ),
  );
  return [...rows, ...cols, ...boxes];
}

/** The 27 units: rows 0-8, then columns 0-8, then boxes 0-8. */
export const UNITS = buildUnits();

/** The 20 peers of each cell (same row, column, or box), sorted ascending. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELL_COUNT }, (_, cell) => {
  const peers = new Set<number>();
  for (const unit of [UNITS[rowOf(cell)]!, UNITS[9 + colOf(cell)]!, UNITS[18 + boxOf(cell)]!]) {
    for (const other of unit) if (other !== cell) peers.add(other);
  }
  return [...peers].sort((a, b) => a - b);
});

export const digitBit = (d: Digit): CandidateMask => 1 << (d - 1);

export function maskDigits(mask: CandidateMask): Digit[] {
  const out: Digit[] = [];
  for (const d of DIGITS) if (mask & digitBit(d)) out.push(d);
  return out;
}

export function popcount(mask: CandidateMask): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

export function emptyGrid(): CellValue[] {
  return new Array<CellValue>(CELL_COUNT).fill(0);
}

/**
 * Parses an 81-character puzzle string. Digits 1-9 are values; '0' or '.' are blanks.
 * Whitespace is ignored so grids can be written as 9 lines.
 */
export function parseGrid(text: string): CellValue[] {
  const chars = text.replace(/\s+/g, "");
  if (chars.length !== CELL_COUNT) {
    throw new Error(`Expected 81 cells, got ${chars.length}`);
  }
  return [...chars].map((ch, i) => {
    if (ch === "." || ch === "0") return 0;
    if (ch >= "1" && ch <= "9") return Number(ch) as Digit;
    throw new Error(`Invalid character '${ch}' at cell ${i}`);
  });
}

/** Serializes a grid to the canonical 81-character form with '.' for blanks. */
export function serializeGrid(grid: Grid): string {
  if (grid.length !== CELL_COUNT) throw new Error(`Expected 81 cells, got ${grid.length}`);
  return grid.map((v) => (v === 0 ? "." : String(v))).join("");
}

/** Candidates for every cell from placed values alone; filled cells get 0. */
export function computeCandidates(grid: Grid): CandidateMask[] {
  return grid.map((value, cell) => {
    if (value !== 0) return 0;
    let mask = ALL_CANDIDATES;
    for (const peer of PEERS[cell]!) {
      const v = grid[peer]!;
      if (v !== 0) mask &= ~digitBit(v);
    }
    return mask;
  });
}
