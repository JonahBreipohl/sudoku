import { ALL_CANDIDATES, PEERS, computeCandidates, digitBit, type CandidateMask, type CellValue, type Digit, type Grid } from "./grid";

/**
 * Values plus per-cell candidate masks, the input to every human-style technique.
 * Treated as immutable: operations return fresh states and never touch their input.
 */
export interface CandidateState {
  readonly values: readonly CellValue[];
  readonly candidates: readonly CandidateMask[];
}

/** Candidates derived purely from the placed values. */
export function fromGrid(grid: Grid): CandidateState {
  return { values: [...grid], candidates: computeCandidates(grid) };
}

/**
 * Intersects computed candidates with user notes, for analysing what the player believed.
 * A note-less (0) empty cell is treated as "no notes taken" and keeps its full computed set,
 * so unannotated cells don't read as contradictions.
 */
export function fromGridAndNotes(grid: Grid, notes: readonly CandidateMask[]): CandidateState {
  const base = computeCandidates(grid);
  const candidates = base.map((mask, cell) => {
    const note = (notes[cell] ?? 0) & ALL_CANDIDATES;
    return note === 0 ? mask : mask & note;
  });
  return { values: [...grid], candidates };
}

/** Sets a value, clears the cell's candidates and removes the digit from every peer. */
export function place(state: CandidateState, cell: number, digit: Digit): CandidateState {
  const values = [...state.values];
  const candidates = [...state.candidates];
  values[cell] = digit;
  candidates[cell] = 0;
  const bit = digitBit(digit);
  for (const peer of PEERS[cell]!) candidates[peer] = candidates[peer]! & ~bit;
  return { values, candidates };
}

/** Removes one candidate from one cell. */
export function eliminate(state: CandidateState, cell: number, digit: Digit): CandidateState {
  const candidates = [...state.candidates];
  candidates[cell] = candidates[cell]! & ~digitBit(digit);
  return { values: [...state.values], candidates };
}
