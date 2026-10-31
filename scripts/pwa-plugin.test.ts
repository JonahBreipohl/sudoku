import { describe, expect, it } from "vitest";
import { precacheList, stampWorker } from "./pwa-plugin";

describe("precacheList", () => {
  it("starts with the shell, drops sw.js, index.html and maps, and is sorted", () => {
    const list = precacheList(["sw.js", "index.html", "puzzles/easy.json", "assets/a-1.js", "assets/a-1.js.map", "manifest.webmanifest"]);
    expect(list).toEqual(["./", "assets/a-1.js", "manifest.webmanifest", "puzzles/easy.json"]);
  });

  it("leaves out host config files, which hosts never serve", () => {
    expect(precacheList(["_headers", "_redirects", "assets/a-1.js"])).toEqual(["./", "assets/a-1.js"]);
  });
});

describe("stampWorker", () => {
  const src = 'const P = JSON.parse("__PRECACHE_JSON__"); const C = "sudoku-__VERSION__";';
  it("embeds a list that round-trips through JSON.parse", () => {
    const list = ["./", 'we"ird.js', "puzzles/easy.json"];
    const out = stampWorker(src, list, "abc123");
    expect(out).toContain("sudoku-abc123");
    const literal = /JSON\.parse\((".*")\);/.exec(out)?.[1] ?? "";
    expect(JSON.parse(JSON.parse(literal) as string)).toEqual(list);
  });
  it("throws when the tokens are absent", () => {
    expect(() => stampWorker("nothing", ["./"], "v")).toThrow();
  });
});
