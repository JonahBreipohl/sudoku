/**
 * Worker protocol. To add an engine method, add ONE entry to `handlers` below: its argument
 * and result types are inferred, and both the worker and the client's `call()` pick it up.
 * Arguments and results must be structured-cloneable. Add a convenience method to the client
 * in client.ts only if you want a nicer signature than `client.call("name", ...args)`.
 */
import { countSolutions, solve } from "../engine";
import type { CellValue, Grid } from "../engine";

export const handlers = {
  solve: (grid: Grid): CellValue[] | null => solve(grid),
  countSolutions: (grid: Grid, limit?: number): number => countSolutions(grid, limit),
};

export type Handlers = typeof handlers;
export type Method = keyof Handlers;

export type Request = {
  [M in Method]: { id: number; method: M; args: Parameters<Handlers[M]> };
}[Method];

export type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

/** Runs a request against the handlers; shared by the worker and the in-thread fallback. */
export function dispatch(req: Request): Response {
  try {
    const fn = handlers[req.method] as (...a: unknown[]) => unknown;
    return { id: req.id, ok: true, result: fn(...req.args) };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
