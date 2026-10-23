// Known puzzles with their solutions, for tests and the walking skeleton.
// Replaced at runtime by the puzzle bank once M3 lands.

export interface SamplePuzzle {
  name: string;
  puzzle: string;
  solution: string;
}

export const SAMPLE_EASY: SamplePuzzle = {
  name: "easy-1",
  puzzle: "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79",
  solution: "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
};
