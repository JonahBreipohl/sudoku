// Vite plugin + helpers: fails the build when the initial JS (entry chunk and its static imports) exceeds the gzip budget.

import { gzipSync } from "node:zlib";
import type { Plugin, Rollup } from "vite";

export const INITIAL_JS_BUDGET_KB = 120;

type Output = Rollup.OutputBundle[string];

/** Gzip bytes of every chunk statically reachable from the entry chunk (dynamic imports excluded). */
export function initialJsGzipBytes(bundle: Rollup.OutputBundle): number {
  const chunks = new Map<string, Rollup.OutputChunk>();
  for (const o of Object.values(bundle as Record<string, Output>)) if (o.type === "chunk") chunks.set(o.fileName, o);
  const seen = new Set<string>();
  const visit = (name: string) => {
    const c = chunks.get(name);
    if (!c || seen.has(name)) return;
    seen.add(name);
    c.imports.forEach(visit);
  };
  for (const c of chunks.values()) if (c.isEntry && !c.facadeModuleId?.includes("worker")) visit(c.fileName);
  let total = 0;
  for (const name of seen) total += gzipSync(chunks.get(name)!.code).length;
  return total;
}

export function sizeBudgetPlugin(budgetKb = INITIAL_JS_BUDGET_KB): Plugin {
  return {
    name: "sudoku-size-budget",
    apply: "build",
    generateBundle(_o, bundle) {
      const kb = initialJsGzipBytes(bundle) / 1024;
      this.info(`initial JS: ${kb.toFixed(1)} KB gzip (budget ${budgetKb} KB)`);
      if (kb > budgetKb) this.error(`Initial JS is ${kb.toFixed(1)} KB gzip, over the ${budgetKb} KB budget`);
    },
  };
}
