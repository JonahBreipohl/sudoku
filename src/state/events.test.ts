import { describe, expect, it } from "vitest";
import { isBoardEvent, isGameRecord, isMetaEvent, type GameRecord } from "./events";

const grid = "1".repeat(81);

function record(): GameRecord {
  return {
    version: 1,
    id: "g1",
    puzzle: grid,
    solution: grid,
    level: "easy",
    score: 12.5,
    source: "bank",
    createdAt: 1000,
    nodes: [
      { id: 0, parent: -1, at: 1, elapsed: 0, type: "place", cell: 0, digit: 5, input: "keyboard", key: "5" },
      { id: 1, parent: 0, at: 2, elapsed: 1, type: "note", cell: 1, digit: 3, on: true },
      { id: 2, parent: 0, at: 3, elapsed: 2, type: "auto-notes" },
    ],
    cursor: 1,
    log: [
      { at: 1, type: "start" },
      { at: 2, type: "undo" },
      { at: 3, type: "rewind", to: -1 },
      { at: 4, type: "hint", tier: "nudge", step: "naked-single" },
      { at: 5, type: "submit", result: "solved" },
    ],
    status: "submitted",
  };
}

const bad = (mutate: (r: Record<string, unknown>) => void): unknown => {
  const r = structuredClone(record()) as unknown as Record<string, unknown>;
  mutate(r);
  return r;
};

describe("isGameRecord", () => {
  it("accepts a valid record, including after a JSON round trip", () => {
    expect(isGameRecord(record())).toBe(true);
    expect(isGameRecord(JSON.parse(JSON.stringify(record())))).toBe(true);
  });

  it("accepts a fresh record with no events and cursor -1", () => {
    expect(isGameRecord({ ...record(), nodes: [], log: [], cursor: -1, status: "playing" })).toBe(true);
  });

  it.each([null, undefined, 3, "x", [], {}])("rejects non-record %j", (v) => {
    expect(isGameRecord(v)).toBe(false);
  });

  it.each([
    ["wrong version", (r: Record<string, unknown>) => (r.version = 2)],
    ["missing version", (r: Record<string, unknown>) => delete r.version],
    ["empty id", (r: Record<string, unknown>) => (r.id = "")],
    ["short puzzle", (r: Record<string, unknown>) => (r.puzzle = "123")],
    ["bad solution chars", (r: Record<string, unknown>) => (r.solution = "x".repeat(81))],
    ["unknown level", (r: Record<string, unknown>) => (r.level = "insane")],
    ["NaN score", (r: Record<string, unknown>) => (r.score = NaN)],
    ["unknown source", (r: Record<string, unknown>) => (r.source = "web")],
    ["negative createdAt", (r: Record<string, unknown>) => (r.createdAt = -1)],
    ["unknown status", (r: Record<string, unknown>) => (r.status = "done")],
    ["nodes not array", (r: Record<string, unknown>) => (r.nodes = {})],
    ["cursor out of range", (r: Record<string, unknown>) => (r.cursor = 3)],
    ["cursor below -1", (r: Record<string, unknown>) => (r.cursor = -2)],
    ["fractional cursor", (r: Record<string, unknown>) => (r.cursor = 0.5)],
    ["node id not its index", (r: Record<string, unknown>) => ((r.nodes as { id: number }[])[1]!.id = 7)],
    ["node parent not earlier", (r: Record<string, unknown>) => ((r.nodes as { parent: number }[])[0]!.parent = 0)],
    ["bad node", (r: Record<string, unknown>) => ((r.nodes as { cell: number }[])[0]!.cell = 81)],
    ["bad log entry", (r: Record<string, unknown>) => (r.log as unknown[]).push({ at: 1, type: "nope" })],
  ])("rejects %s", (_name, mutate) => {
    expect(isGameRecord(bad(mutate))).toBe(false);
  });
});

describe("isBoardEvent", () => {
  const base = { id: 0, parent: -1, at: 0, elapsed: 0 };
  it("accepts every board event type", () => {
    const events = [
      { type: "place", cell: 80, digit: 9, input: "pad" },
      { type: "erase", cell: 0 },
      { type: "note", cell: 4, digit: 1, on: false },
      { type: "auto-notes" },
      { type: "reset" },
      { type: "hint-reveal", cell: 2, digit: 7, step: "hidden-single" },
    ];
    for (const e of events) expect(isBoardEvent({ ...base, ...e })).toBe(true);
  });

  it("rejects bad fields", () => {
    expect(isBoardEvent({ ...base, type: "place", cell: 0, digit: 0, input: "pad" })).toBe(false);
    expect(isBoardEvent({ ...base, type: "place", cell: 0, digit: 1, input: "voice" })).toBe(false);
    expect(isBoardEvent({ ...base, type: "note", cell: 0, digit: 1 })).toBe(false);
    expect(isBoardEvent({ ...base, type: "erase", cell: 1.5 })).toBe(false);
    expect(isBoardEvent({ ...base, type: "undo" })).toBe(false);
    expect(isBoardEvent({ type: "reset", at: 0, elapsed: 0 })).toBe(false);
  });
});

describe("isMetaEvent", () => {
  it("accepts every meta event type", () => {
    const events = [
      { type: "start" }, { type: "pause" }, { type: "resume" }, { type: "hidden" },
      { type: "visible" }, { type: "undo" }, { type: "redo" }, { type: "rewind", to: 3 },
      { type: "check", mistakes: 0 }, { type: "hint", tier: "reveal", step: "x-wing" },
      { type: "settings-assist", autoCandidates: true }, { type: "submit", result: "incorrect" },
    ];
    for (const e of events) expect(isMetaEvent({ at: 1, ...e })).toBe(true);
  });

  it("rejects bad fields", () => {
    expect(isMetaEvent({ type: "start" })).toBe(false);
    expect(isMetaEvent({ at: 1, type: "rewind" })).toBe(false);
    expect(isMetaEvent({ at: 1, type: "hint", tier: "full", step: "x" })).toBe(false);
    expect(isMetaEvent({ at: 1, type: "submit", result: "maybe" })).toBe(false);
    expect(isMetaEvent({ at: 1, type: "check", mistakes: -1 })).toBe(false);
  });
});
