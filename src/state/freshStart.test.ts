import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SAMPLE_EASY } from "../engine/samples";
import { freshStartRecord } from "./freshStart";

const text = readFileSync("public/puzzles/easy.json", "utf8");
const fetchBank = async () => ({ ok: true, json: async () => JSON.parse(text) as unknown });

describe("freshStartRecord", () => {
  it("picks an easy bank puzzle by the random value, not the sample", async () => {
    const lo = await freshStartRecord({ fetch: fetchBank, random: () => 0 });
    const hi = await freshStartRecord({ fetch: fetchBank, random: () => 0.999 });
    expect(lo).toMatchObject({ level: "easy", source: "bank", status: "playing" });
    expect(lo.puzzle).not.toBe(SAMPLE_EASY.puzzle);
    expect(hi.id).not.toBe(lo.id);
  });

  it("skips played ids and records the pick", async () => {
    const first = await freshStartRecord({ fetch: fetchBank, random: () => 0 });
    const played = new Set([first.id]);
    const next = await freshStartRecord({
      fetch: fetchBank,
      random: () => 0,
      played: { has: (id) => played.has(id), add: (id) => void played.add(id) },
    });
    expect(next.id).not.toBe(first.id);
    expect(played.has(next.id)).toBe(true);
  });

  it("rejects when the bank cannot load", async () => {
    await expect(freshStartRecord({ fetch: async () => ({ ok: false, json: async () => null }) })).rejects.toThrow();
    await expect(freshStartRecord({ fetch: async () => ({ ok: true, json: async () => ({}) }) })).rejects.toThrow();
  });
});
