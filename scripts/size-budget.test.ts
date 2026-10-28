import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Rollup } from "vite";
import { initialJsGzipBytes } from "./size-budget";

const chunk = (fileName: string, code: string, o: Partial<Rollup.OutputChunk>) =>
  ({ type: "chunk", fileName, code, imports: [], isEntry: false, ...o }) as unknown as Rollup.OutputChunk;

describe("initialJsGzipBytes", () => {
  it("counts the entry and its static imports but not dynamic chunks", () => {
    const a = "a".repeat(5000);
    const b = "b".repeat(7000);
    const bundle = {
      "index.js": chunk("index.js", a, { isEntry: true, imports: ["shared.js"] }),
      "shared.js": chunk("shared.js", b, {}),
      "lazy.js": chunk("lazy.js", "c".repeat(9000), {}),
    } as unknown as Rollup.OutputBundle;
    expect(initialJsGzipBytes(bundle)).toBe(gzipSync(a).length + gzipSync(b).length);
  });
});
