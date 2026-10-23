#!/usr/bin/env node
// Usage and cost from Claude Code transcripts for this project.
//
//   node scripts/usage.mjs --since <ISO>            human-readable totals
//   node scripts/usage.mjs --since <ISO> --json     machine-readable totals
//   node scripts/usage.mjs --since <ISO> --out snap.json
//                                                   also save a snapshot
//   node scripts/usage.mjs --since <ISO> --compare snap.json
//                                                   show only what changed since the snapshot
//   node scripts/usage.mjs --file <transcript.jsonl> [--since <ISO>]
//                                                   cost of a single transcript
//
// Options: --projects-dir <dir> overrides ~/.claude/projects (or $CLAUDE_CONFIG_DIR/projects).
//          --project <dir> overrides the project directory used to find transcripts (default: cwd).
//
// Transcripts are read from every directory under the projects dir whose name starts with this
// project's slug (that covers worktrees), recursively, so subagent transcripts are included.
// Each API response is counted once, keyed by message id + request id.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// USD per million tokens. Cache writes: 1.25x input for 5m TTL, 2x for 1h TTL.
// Source: claude-api skill model table, cached 2026-10-06. Update here if prices change.
const PRICES = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-mythos-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1.0 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, fastMultiplier: 2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, fastMultiplier: 2 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, fastMultiplier: 2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  // Haiku 5.5 prompts over 100K tokens bill at $0.50 / $2.50.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, longPrompt: { over: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 } },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};
const FALLBACK_MODEL = "claude-opus-5-5";
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

function projectSlug(dir) {
  return path.resolve(dir).replace(/[^A-Za-z0-9]/g, "-");
}

function projectsDir(args) {
  if (args["projects-dir"]) return args["projects-dir"];
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return path.join(base, "projects");
}

function listJsonl(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listJsonl(p, out);
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

function transcriptFiles(args) {
  if (args.file) return [path.resolve(args.file)];
  const root = projectsDir(args);
  const slug = projectSlug(args.project || process.cwd());
  let dirs;
  try { dirs = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return dirs
    .filter((d) => d.isDirectory() && d.name.startsWith(slug))
    .flatMap((d) => listJsonl(path.join(root, d.name)));
}

function costOf(model, usage) {
  const known = PRICES[model];
  let p = known || PRICES[FALLBACK_MODEL];
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  if (p.longPrompt && input + cacheRead + cacheWrite > p.longPrompt.over) p = { ...p, ...p.longPrompt };
  const w1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const w5m = usage.cache_creation ? usage.cache_creation.ephemeral_5m_input_tokens ?? 0 : cacheWrite;
  const mult = usage.speed === "fast" && p.fastMultiplier ? p.fastMultiplier : 1;
  const tokenCost =
    (input * p.input + output * p.output + cacheRead * p.cacheRead + w5m * p.input * 1.25 + w1h * p.input * 2) / 1e6;
  const searches = usage.server_tool_use?.web_search_requests || 0;
  return { usd: tokenCost * mult + searches * WEB_SEARCH_USD, known: Boolean(known) };
}

function emptyBucket() {
  return { usd: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, responses: 0 };
}

function add(bucket, usage, usd) {
  bucket.usd += usd;
  bucket.input += usage.input_tokens || 0;
  bucket.output += usage.output_tokens || 0;
  bucket.cache_read += usage.cache_read_input_tokens || 0;
  bucket.cache_write += usage.cache_creation_input_tokens || 0;
  bucket.responses += 1;
}

function collect(files, sinceMs) {
  const total = emptyBucket();
  const byModel = {};
  const byFile = {};
  const unknownModels = new Set();
  const seen = new Set();
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      if (!line.includes('"usage"')) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const msg = entry.message;
      if (entry.type !== "assistant" || !msg?.usage || !msg.model || msg.model === "<synthetic>") continue;
      const ts = Date.parse(entry.timestamp);
      if (sinceMs && !(ts >= sinceMs)) continue;
      const key = `${msg.id}|${entry.requestId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { usd, known } = costOf(msg.model, msg.usage);
      if (!known) unknownModels.add(msg.model);
      add(total, msg.usage, usd);
      add((byModel[msg.model] ??= emptyBucket()), msg.usage, usd);
      const f = (byFile[file] ??= { ...emptyBucket(), first: entry.timestamp, last: entry.timestamp, models: [] });
      add(f, msg.usage, usd);
      if (entry.timestamp < f.first) f.first = entry.timestamp;
      if (entry.timestamp > f.last) f.last = entry.timestamp;
      if (!f.models.includes(msg.model)) f.models.push(msg.model);
    }
  }
  return { total, byModel, byFile, unknownModels: [...unknownModels] };
}

function round(b) {
  const out = { ...b, usd: Math.round(b.usd * 10000) / 10000 };
  return out;
}

function subtract(now, before) {
  const out = { ...now };
  for (const k of ["usd", "input", "output", "cache_read", "cache_write", "responses"]) out[k] = now[k] - (before?.[k] || 0);
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceMs = args.since ? Date.parse(args.since) : 0;
  if (args.since && Number.isNaN(sinceMs)) {
    console.error(`usage.mjs: cannot parse --since ${args.since}`);
    process.exit(2);
  }
  const files = transcriptFiles(args);
  if (files.length === 0) {
    console.error("usage.mjs: no transcripts found");
    process.exit(1);
  }
  const r = collect(files, sinceMs);
  const report = {
    since: args.since || null,
    generated_at: new Date().toISOString(),
    total: round(r.total),
    by_model: Object.fromEntries(Object.entries(r.byModel).map(([m, b]) => [m, round(b)])),
    by_file: Object.fromEntries(Object.entries(r.byFile).map(([f, b]) => [f, round(b)])),
    unknown_models_priced_as: r.unknownModels.length ? { models: r.unknownModels, as: FALLBACK_MODEL } : undefined,
  };

  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  }

  let shown = report;
  if (args.compare) {
    const before = JSON.parse(fs.readFileSync(args.compare, "utf8"));
    const byFile = {};
    for (const [f, b] of Object.entries(report.by_file)) {
      const d = subtract(b, before.by_file?.[f]);
      if (d.responses > 0) byFile[f] = round(d);
    }
    const byModel = {};
    for (const [m, b] of Object.entries(report.by_model)) {
      const d = subtract(b, before.by_model?.[m]);
      if (d.responses > 0) byModel[m] = round(d);
    }
    shown = { ...report, compared_to: args.compare, total: round(subtract(report.total, before.total)), by_model: byModel, by_file: byFile };
  }

  if (args.json) {
    console.log(JSON.stringify(shown, null, 2));
    return;
  }
  const t = shown.total;
  console.log(`${args.compare ? "delta" : "total"}: $${t.usd.toFixed(4)}  (${t.responses} responses, in ${t.input}, out ${t.output}, cache r ${t.cache_read} / w ${t.cache_write})`);
  for (const [m, b] of Object.entries(shown.by_model)) console.log(`  ${m}: $${b.usd.toFixed(4)} (${b.responses})`);
  const rows = Object.entries(shown.by_file).sort((a, b) => b[1].usd - a[1].usd);
  for (const [f, b] of rows) console.log(`  $${b.usd.toFixed(4)}  ${b.models.join(",")}  ${path.basename(path.dirname(f))}/${path.basename(f)}`);
  if (shown.unknown_models_priced_as) console.log(`  warning: unknown models priced as ${FALLBACK_MODEL}: ${shown.unknown_models_priced_as.models.join(", ")}`);
}

main();
