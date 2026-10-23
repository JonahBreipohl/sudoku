import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildReport, costOfUsage, findTranscripts, priceKeyFor } from "./usage.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "fixtures", "transcripts");
const slug = "fixture-project";
const config = JSON.parse(fs.readFileSync(path.join(here, "..", "director", "config.json"), "utf8"));
const prices = config.prices_per_mtok;

function report(opts = {}) {
  const { files, session } = findTranscripts({ root, slug, session: opts.session });
  return buildReport({ files, root, prices, since: opts.since, session });
}

describe("priceKeyFor", () => {
  it("maps model ids by family name", () => {
    expect(priceKeyFor("claude-opus-5-5")).toBe("opus");
    expect(priceKeyFor("claude-sonnet-5-5")).toBe("sonnet");
    expect(priceKeyFor("claude-haiku-5-5")).toBe("haiku");
    expect(priceKeyFor("claude-fable-5-1")).toBe("fable");
    expect(priceKeyFor("claude-mythos-5-1")).toBe("fable");
    expect(priceKeyFor("claude-future-9")).toBeNull();
  });
});

describe("costOfUsage", () => {
  it("prices 1h cache writes separately from 5m writes", () => {
    const usage = {
      input_tokens: 1000,
      output_tokens: 2000,
      cache_read_input_tokens: 10000,
      cache_creation_input_tokens: 4000,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 4000 },
    };
    expect(costOfUsage("opus", usage, prices)).toBeCloseTo(0.078, 9);
  });

  it("uses Haiku's long-prompt prices when input plus cache exceeds 100K", () => {
    const usage = { input_tokens: 50000, output_tokens: 1000, cache_read_input_tokens: 60000 };
    expect(costOfUsage("haiku", usage, prices)).toBeCloseTo(0.0305, 9);
    expect(costOfUsage("haiku", { input_tokens: 1000, output_tokens: 1000 }, prices)).toBeCloseTo(0.0006, 9);
  });
});

describe("report", () => {
  it("splits one session into main, sidechain and subagent files, deduped and filtered by --since", () => {
    const r = report({ session: "sess-1", since: "2026-10-01T00:00:00Z" });
    expect(r.session).toBe("sess-1");
    const files = r.by_file;
    expect(Object.keys(files).sort()).toEqual([
      "fixture-project/sess-1.jsonl",
      "fixture-project/sess-1.jsonl#sidechain",
      "fixture-project/sess-1/subagents/agent-abc.jsonl",
    ]);
    expect(files["fixture-project/sess-1.jsonl"].cost_usd).toBeCloseTo(0.078, 6);
    expect(files["fixture-project/sess-1.jsonl"].responses).toBe(1);
    expect(files["fixture-project/sess-1.jsonl#sidechain"]).toMatchObject({ kind: "sidechain", cost_usd: 0.0135 });
    expect(files["fixture-project/sess-1/subagents/agent-abc.jsonl"]).toMatchObject({
      kind: "subagent",
      agent_id: "abc",
      responses: 2,
      cost_usd: 0.0311,
    });
    expect(r.overall).toMatchObject({ responses: 4, input: 52500, output: 5000, cache_read: 70000, cache_creation: 5000 });
    expect(r.overall.cost_usd).toBeCloseTo(0.1226, 6);
    expect(r.by_model["claude-haiku-5-5"]).toMatchObject({ price_key: "haiku", responses: 2 });
    expect(r.unknown_models).toBeNull();
  });

  it("covers every session and worktree directory without filters, pricing unknown models as opus", () => {
    const r = report();
    expect(r.overall.responses).toBe(7);
    expect(r.overall.cost_usd).toBeCloseTo(4.1326, 6);
    expect(r.unknown_models).toEqual({ models: ["claude-future-9"], priced_as: "opus" });
  });

  it("resolves --session latest to the most recently modified main transcript", () => {
    const now = Date.now() / 1000;
    fs.utimesSync(path.join(root, slug, "sess-1.jsonl"), now - 100, now - 100);
    fs.utimesSync(path.join(root, `${slug}-worktree`, "sess-3.jsonl"), now - 100, now - 100);
    fs.utimesSync(path.join(root, slug, "sess-2.jsonl"), now, now);
    const r = report({ session: "latest" });
    expect(r.session).toBe("sess-2");
    expect(r.overall.cost_usd).toBeCloseTo(0.006, 6);
  });
});
