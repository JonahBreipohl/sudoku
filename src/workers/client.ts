/**
 * Promise-based client for the engine worker. Methods are defined by the shared protocol in
 * protocol.ts (one entry per method). Uses a module Worker when available, otherwise runs the
 * same handlers in-thread (tests, environments without workers).
 */
import type { CandidateState, CellValue, Grid, Level, Step } from "../engine";
import { dispatch } from "./protocol";
import type { Hint } from "../analysis/hints";
import type { GameRecord, HintTier } from "../state/events";
import type { AnalysisResult, GeneratedResult, ImportResult, Handlers, Method, Request, Response } from "./protocol";

export class CancelledError extends Error {
  constructor() {
    super("Request cancelled");
    this.name = "CancelledError";
  }
}

interface Pending {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
}

export interface EngineClient {
  call<M extends Method>(method: M, ...args: Parameters<Handlers[M]>): Promise<Awaited<ReturnType<Handlers[M]>>>;
  solve(grid: Grid): Promise<CellValue[] | null>;
  countSolutions(grid: Grid, limit?: number): Promise<number>;
  generate(level: Level, seed: number | string): Promise<GeneratedResult>;
  importPuzzle(text: string): Promise<ImportResult>;
  analyze(record: GameRecord): Promise<AnalysisResult>;
  hint(record: GameRecord, tier: HintTier): Promise<Hint>;
  nextStep(state: CandidateState, maxLevel: Level): Promise<Step | null>;
  /** Rejects every pending call with CancelledError and stops any running computation. */
  cancel(): void;
  dispose(): void;
}

/** `inThread: true` forces the fallback; by default it is used only when Worker is missing. */
export function createEngineClient(opts: { inThread?: boolean } = {}): EngineClient {
  const useWorker = !opts.inThread && typeof Worker !== "undefined";
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let worker: Worker | null = null;

  const settle = (res: Response) => {
    const p = pending.get(res.id);
    if (!p) return; // cancelled meanwhile
    pending.delete(res.id);
    if (res.ok) p.resolve(res.result as never);
    else p.reject(new Error(res.error));
  };

  const getWorker = (): Worker => {
    if (!worker) {
      worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<Response>) => settle(e.data);
      worker.onerror = (e) => {
        const err = new Error(e.message || "Worker error");
        for (const p of pending.values()) p.reject(err);
        pending.clear();
      };
    }
    return worker;
  };

  const killWorker = () => {
    worker?.terminate();
    worker = null; // recreated lazily on the next call
  };

  function call<M extends Method>(method: M, ...args: Parameters<Handlers[M]>) {
    return new Promise<Awaited<ReturnType<Handlers[M]>>>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const req = { id, method, args } as Request;
      if (useWorker) getWorker().postMessage(req);
      else queueMicrotask(() => settle(dispatch(req)));
    });
  }

  const cancel = () => {
    const err = new CancelledError();
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    killWorker();
  };

  return {
    call,
    solve: (grid) => call("solve", grid),
    countSolutions: (grid, limit) => call("countSolutions", grid, limit),
    generate: (level, seed) => call("generate", level, seed),
    importPuzzle: (text) => call("importPuzzle", text),
    analyze: (record) => call("analyze", record),
    hint: (record, tier) => call("hint", record, tier),
    nextStep: (state, maxLevel) => call("nextStep", state, maxLevel),
    cancel,
    dispose: () => {
      cancel();
    },
  };
}

let shared: EngineClient | null = null;
/** App-wide client, created on first use. */
export function getEngineClient(): EngineClient {
  return (shared ??= createEngineClient());
}
