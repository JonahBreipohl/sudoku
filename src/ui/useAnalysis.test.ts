import { describe, expect, it, vi } from "vitest";
import { SAMPLE_EASY } from "../engine/samples";
import type { GameRecord } from "../state/events";
import { createEngineClient } from "../workers/client";
import { ANALYSIS_ERROR_MESSAGE, createAnalysisController, recordVersion } from "./useAnalysis";

const record = (over: Partial<GameRecord> = {}): GameRecord => ({
  version: 1,
  id: "r1",
  puzzle: SAMPLE_EASY.puzzle,
  solution: SAMPLE_EASY.solution,
  level: "easy",
  score: 0,
  source: "import",
  createdAt: 0,
  nodes: [],
  cursor: -1,
  log: [],
  status: "playing",
  ...over,
});

describe("worker analyze", () => {
  it("returns both reports through the client", async () => {
    const c = createEngineClient({ inThread: true });
    const r = await c.analyze(record());
    expect(r.mistakes.recordId).toBe("r1");
    expect(r.solve.recordId).toBe("r1");
    expect(r.mistakes.root).toBeNull();
  });
});

describe("analysis controller", () => {
  it("re-runs a failed version on the next request (what refetch relies on)", async () => {
    const client = createEngineClient({ inThread: true });
    const real = client.analyze.bind(client);
    const spy = vi.spyOn(client, "analyze").mockRejectedValueOnce(new Error("boom"));
    const ctl = createAnalysisController(client, () => {});
    await expect(ctl.analyze(record())).rejects.toThrow(ANALYSIS_ERROR_MESSAGE);
    spy.mockImplementation(real);
    expect((await ctl.analyze(record())).mistakes.recordId).toBe("r1");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("caches per record version and recomputes when the version changes", async () => {
    const client = createEngineClient({ inThread: true });
    const spy = vi.spyOn(client, "analyze");
    const ctl = createAnalysisController(client);
    const [a, b] = await Promise.all([ctl.analyze(record()), ctl.analyze(record())]);
    await ctl.analyze(record());
    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);
    await ctl.analyze(record({ status: "submitted" }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(recordVersion(record())).not.toBe(recordVersion(record({ cursor: 3 })));
  });

  it("maps errors to a friendly message and logs a version once", async () => {
    const client = { analyze: vi.fn().mockRejectedValue(new Error("boom")) };
    const log = vi.fn();
    const ctl = createAnalysisController(client, log);
    await expect(ctl.analyze(record())).rejects.toThrow(ANALYSIS_ERROR_MESSAGE);
    await expect(ctl.analyze(record())).rejects.toThrow(ANALYSIS_ERROR_MESSAGE);
    expect(log).toHaveBeenCalledTimes(1);
    expect(client.analyze).toHaveBeenCalledTimes(2); // failures are not cached
  });
});
