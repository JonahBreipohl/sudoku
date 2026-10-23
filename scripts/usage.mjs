#!/usr/bin/env node
// Token usage and API-equivalent cost from this project's Claude Code transcripts.
//
//   node scripts/usage.mjs [--since <ISO time>] [--session <id>|latest]
//                          [--projects-dir <dir>] [--project <dir>] [--config <file>]
//
// Prints JSON: overall totals, totals per model, and totals per transcript file.
//
// Where transcripts live: ~/.claude/projects/<slug>/ (or $CLAUDE_CONFIG_DIR/projects/<slug>/),
// where <slug> is the project path with every non-alphanumeric character replaced by "-".
// Directories whose name starts with the slug are included too, which covers worktrees.
//   <slug>/<session>.jsonl                      main session
//   <slug>/<session>/subagents/agent-<id>.jsonl  subagents (current layout)
// Older transcripts write subagent turns into the main file with "isSidechain": true; those are
// reported as a separate "<file>#sidechain" entry.
//
// Each API response is counted once (message.id + requestId). Prices come from
// director/config.json prices_per_mtok; model ids map to a price key by family name.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FAMILIES = [
  ["fable", "fable"],
  ["mythos", "fable"],
  ["opus", "opus"],
  ["sonnet", "sonnet"],
  ["haiku", "haiku"],
];
const FALLBACK_KEY = "opus";
const HAIKU_LONG_PROMPT = 100_000;

export function priceKeyFor(model) {
  const id = model.toLowerCase();
  for (const [needle, key] of FAMILIES) if (id.includes(needle)) return key;
  return null;
}

export function projectSlug(dir) {
  return path.resolve(dir).replace(/[^A-Za-z0-9]/g, "-");
}

/** Cost in USD of one response's usage block under one price table. */
export function costOfUsage(priceKey, usage, prices) {
  let p = prices[priceKey];
  if (!p) throw new Error(`No prices for '${priceKey}' in config`);
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  if (p.over_100k && input + cacheRead + cacheWrite > HAIKU_LONG_PROMPT) p = p.over_100k;
  // Without a TTL breakdown, assume the default 5-minute cache.
  const w1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const w5m = usage.cache_creation ? (usage.cache_creation.ephemeral_5m_input_tokens ?? 0) : cacheWrite;
  return (input * p.in + output * p.out + cacheRead * p.cache_read + w5m * p.cache_write_5m + w1h * p.cache_write_1h) / 1e6;
}

function emptyTotals() {
  return { input: 0, output: 0, cache_creation: 0, cache_read: 0, cost_usd: 0, responses: 0 };
}

function addTo(t, usage, cost) {
  t.input += usage.input_tokens || 0;
  t.output += usage.output_tokens || 0;
  t.cache_creation += usage.cache_creation_input_tokens || 0;
  t.cache_read += usage.cache_read_input_tokens || 0;
  t.cost_usd += cost;
  t.responses += 1;
}

function rounded(t) {
  return { ...t, cost_usd: Math.round(t.cost_usd * 1e6) / 1e6 };
}

function listJsonl(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listJsonl(p, out);
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

/** Transcript files for the project, optionally limited to one session (main file plus its directory). */
export function findTranscripts({ root, slug, session }) {
  let dirs;
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith(slug));
  } catch {
    return { files: [], session: null };
  }
  const files = dirs.flatMap((d) => listJsonl(path.join(root, d.name)));
  if (!session) return { files, session: null };

  let id = session;
  if (session === "latest") {
    const mains = files.filter((f) => path.basename(path.dirname(f)).startsWith(slug));
    mains.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (mains.length === 0) return { files: [], session: null };
    id = path.basename(mains[0], ".jsonl");
  }
  const inSession = (f) => path.basename(f, ".jsonl") === id || f.split(path.sep).includes(id);
  return { files: files.filter(inSession), session: id };
}

/** Builds the usage report for the given transcript files. */
export function buildReport({ files, root, prices, since, session = null }) {
  const sinceMs = since ? Date.parse(since) : 0;
  const overall = emptyTotals();
  const byModel = {};
  const byFile = {};
  const unknown = new Set();
  const seen = new Set();

  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const kind = rel.includes("/subagents/") ? "subagent" : "main";
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.includes('"usage"')) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = entry.message;
      if (entry.type !== "assistant" || !msg?.usage || !msg.model || msg.model === "<synthetic>") continue;
      if (sinceMs && !(Date.parse(entry.timestamp) >= sinceMs)) continue;
      const key = `${msg.id}|${entry.requestId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let priceKey = priceKeyFor(msg.model);
      if (!priceKey) {
        unknown.add(msg.model);
        priceKey = FALLBACK_KEY;
      }
      const cost = costOfUsage(priceKey, msg.usage, prices);
      addTo(overall, msg.usage, cost);
      addTo((byModel[msg.model] ??= { price_key: priceKey, ...emptyTotals() }), msg.usage, cost);

      const sidechain = kind === "main" && entry.isSidechain === true;
      const fileKey = sidechain ? `${rel}#sidechain` : rel;
      const f = (byFile[fileKey] ??= {
        kind: sidechain ? "sidechain" : kind,
        session: entry.sessionId ?? null,
        agent_id: entry.agentId ?? null,
        models: [],
        first: entry.timestamp,
        last: entry.timestamp,
        ...emptyTotals(),
      });
      addTo(f, msg.usage, cost);
      if (!f.models.includes(msg.model)) f.models.push(msg.model);
      if (entry.timestamp < f.first) f.first = entry.timestamp;
      if (entry.timestamp > f.last) f.last = entry.timestamp;
    }
  }

  return {
    since: since ?? null,
    session,
    generated_at: new Date().toISOString(),
    overall: rounded(overall),
    by_model: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, rounded(v)])),
    by_file: Object.fromEntries(Object.entries(byFile).map(([k, v]) => [k, rounded(v)])),
    unknown_models: unknown.size ? { models: [...unknown], priced_as: FALLBACK_KEY } : null,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true;
    else args[a.slice(2)] = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const configPath = args.config || path.join(here, "..", "director", "config.json");
  const prices = JSON.parse(fs.readFileSync(configPath, "utf8")).prices_per_mtok;
  if (args.since && Number.isNaN(Date.parse(args.since))) {
    console.error(`usage.mjs: cannot parse --since ${args.since}`);
    process.exit(2);
  }
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const root = args["projects-dir"] || path.join(base, "projects");
  const slug = projectSlug(args.project || path.join(here, ".."));
  const { files, session } = findTranscripts({ root, slug, session: args.session });
  if (files.length === 0) {
    console.error(`usage.mjs: no transcripts found under ${root} for ${slug}`);
    process.exit(1);
  }
  const since = typeof args.since === "string" ? args.since : undefined;
  console.log(JSON.stringify(buildReport({ files, root, prices, since, session }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
