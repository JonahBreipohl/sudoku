// Test hook: counts committed Cell renders so e2e can prove a placement re-renders few cells.
// Always cheap; only read when the app runs with ?test=1.
const counts = new Array<number>(81).fill(0);

export function recordCellCommit(cell: number): void {
  counts[cell] = (counts[cell] ?? 0) + 1;
}

export function cellCommitCounts(): readonly number[] {
  return counts;
}
