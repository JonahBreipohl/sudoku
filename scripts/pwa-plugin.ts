// Vite plugin: after the build, compiles src/sw.ts and writes dist/sw.js stamped with the file list
// to precache (app shell, hashed assets, icons, manifest, puzzle bank) and a content-derived version.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { transformWithOxc, type Plugin } from "vite";

/** Paths (relative to the output dir, "./" for the shell) the worker should precache. */
export function precacheList(files: readonly string[]): string[] {
  const keep = files.filter((f) => f !== "sw.js" && f !== "index.html" && !f.endsWith(".map")).sort();
  return ["./", ...keep];
}

/** Stamps the compiled worker source with the precache list and a version. Throws if a token is missing. */
export function stampWorker(source: string, list: readonly string[], version: string): string {
  const json = JSON.stringify(list).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const out = source.replace("__PRECACHE_JSON__", () => json).replace("__VERSION__", () => version);
  if (out === source || out.includes("__PRECACHE_JSON__") || out.includes("__VERSION__")) {
    throw new Error("sw.ts is missing its __PRECACHE_JSON__ / __VERSION__ tokens");
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function pwaPlugin(): Plugin {
  let outDir = "";
  let root = "";
  return {
    name: "sudoku-pwa",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = join(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = walk(outDir).map((f) => relative(outDir, f).split(sep).join("/"));
      const hash = createHash("sha256");
      for (const f of files.filter((f) => f !== "sw.js").sort()) {
        hash.update(f).update(readFileSync(join(outDir, f)));
      }
      const src = readFileSync(join(root, "src", "sw.ts"), "utf8");
      const { code } = await transformWithOxc(src, "sw.ts", { lang: "ts" });
      writeFileSync(join(outDir, "sw.js"), stampWorker(code, precacheList(files), hash.digest("hex").slice(0, 12)));
    },
  };
}
