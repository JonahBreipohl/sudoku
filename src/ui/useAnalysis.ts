import { useCallback, useEffect, useState } from "react";
import type { GameRecord } from "../state/events";
import { getEngineClient, type EngineClient } from "../workers/client";
import type { AnalysisResult } from "../workers/protocol";

export const ANALYSIS_ERROR_MESSAGE = "Analysis could not be completed. Please try again.";

/**
 * A record changes by appending nodes/log entries or moving the cursor; the id alone would serve
 * stale reports after a rewind, so the key covers everything analysis reads.
 */
export function recordVersion(r: GameRecord): string {
  return `${r.id}:${r.nodes.length}:${r.cursor}:${r.log.length}:${r.status}:${r.activeMs ?? ""}`;
}

export interface AnalysisController {
  /** Resolves from cache when the record version was already analysed. */
  analyze(record: GameRecord): Promise<AnalysisResult>;
}

type Analyzer = Pick<EngineClient, "analyze">;

/** Caches per record version, shares in-flight work, and logs a failing version once. */
export function createAnalysisController(
  client: Analyzer,
  log: (message: string, error: unknown) => void = (m, e) => console.error(m, e),
  maxEntries = 20,
): AnalysisController {
  const cache = new Map<string, Promise<AnalysisResult>>();
  const logged = new Set<string>();
  return {
    analyze(record) {
      const key = recordVersion(record);
      const hit = cache.get(key);
      if (hit) return hit;
      const p = client.analyze(record).catch((e: unknown) => {
        cache.delete(key); // let a later request retry
        if (!logged.has(key)) {
          logged.add(key);
          log(`Analysis failed for ${key}`, e);
        }
        throw new Error(ANALYSIS_ERROR_MESSAGE);
      });
      cache.set(key, p);
      if (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
      return p;
    },
  };
}

let shared: AnalysisController | null = null;
function getController(): AnalysisController {
  return (shared ??= createAnalysisController(getEngineClient()));
}

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: AnalysisResult }
  | { status: "error"; message: string };

/** Analyses the record off the main thread; pass null to stay idle. */
export function useAnalysis(
  record: GameRecord | null,
  controller?: AnalysisController,
): { state: AnalysisState; refetch: () => void } {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; value: AnalysisState }>({
    key: "",
    value: { status: "idle" },
  });
  const key = record ? recordVersion(record) : "";
  useEffect(() => {
    if (!record) return;
    let live = true;
    (controller ?? getController()).analyze(record).then(
      (result) => live && setState({ key, value: { status: "ready", result } }),
      (e: unknown) =>
        live &&
        setState({ key, value: { status: "error", message: e instanceof Error ? e.message : ANALYSIS_ERROR_MESSAGE } }),
    );
    return () => {
      live = false;
    };
    // The key stands in for the record's identity and contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controller, nonce]);
  const refetch = useCallback(() => {
    // Drop the stale error so the panel shows loading while the retry runs.
    setState({ key: "", value: { status: "idle" } });
    setNonce((n) => n + 1);
  }, []);
  if (!record) return { state: { status: "idle" }, refetch };
  return { state: state.key === key ? state.value : { status: "loading" }, refetch };
}
