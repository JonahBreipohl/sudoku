import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePuzzleInput, type PuzzleParseFailure } from "../engine";
import { SAMPLE_EASY } from "../engine/samples";
import { createEngineClient } from "../workers/client";
import { copyText, IMPORT_ERRORS } from "./shareCopy";

afterEach(() => vi.unstubAllGlobals());

describe("importPuzzle (worker handler, in-thread)", () => {
  const c = createEngineClient({ inThread: true });

  it("grades a valid puzzle and returns its solution", async () => {
    const r = await c.importPuzzle(SAMPLE_EASY.puzzle);
    expect(r).toMatchObject({ ok: true, solution: SAMPLE_EASY.solution, level: "easy" });
  });

  it("accepts a share URL", async () => {
    const r = await c.importPuzzle(`https://x.test/?puzzle=${SAMPLE_EASY.puzzle}`);
    expect(r.ok).toBe(true);
  });

  it("passes the codec's specific reason through", async () => {
    expect(await c.importPuzzle("123")).toEqual({ ok: false, reason: "wrong-length" });
    expect(await c.importPuzzle("x".repeat(81))).toEqual({ ok: false, reason: "invalid-characters" });
    expect(await c.importPuzzle("11" + ".".repeat(79))).toEqual({ ok: false, reason: "rule-conflict" });
    expect(await c.importPuzzle(".".repeat(81))).toEqual({ ok: false, reason: "multiple-solutions" });
  });

  it("has wording for every codec failure", () => {
    const reasons: PuzzleParseFailure[] = ["wrong-length", "invalid-characters", "rule-conflict", "no-solution", "multiple-solutions"];
    for (const reason of reasons) expect(IMPORT_ERRORS[reason].length).toBeGreaterThan(10);
    expect(parsePuzzleInput("").ok).toBe(false);
  });
});

describe("copyText", () => {
  const field = (copy: () => boolean) => {
    const f = { focus: vi.fn(), select: vi.fn() };
    vi.stubGlobal("document", { execCommand: copy });
    return f as unknown as HTMLInputElement;
  };

  it("uses the clipboard API when allowed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("abc", null)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("abc");
  });

  it("falls back to execCommand when the clipboard API is denied", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const f = field(() => true);
    expect(await copyText("abc", f)).toBe("copied");
    expect(f.select).toHaveBeenCalled();
  });

  it("asks for a manual copy when everything is blocked", async () => {
    vi.stubGlobal("navigator", {});
    const f = field(() => false);
    expect(await copyText("abc", f)).toBe("manual");
    expect(f.select).toHaveBeenCalled();
  });
});
