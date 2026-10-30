#!/usr/bin/env node
// Plan-usage budget for the Director: how much of the plan's 5-hour and 7-day usage windows the
// Director may still use, in percent and in API-equivalent dollars.
//
//   node scripts/plan-budget.mjs [--since <run_start ISO>] [--run-usd <n>]
//   node scripts/plan-budget.mjs --since <run_start ISO> --log-run <run_id> [--run-usd <n>]
//   node scripts/plan-budget.mjs --record [--five-hour <pct>] [--seven-day <pct>]
//                                [--resets-at <ISO|epoch s>] [--at <ISO>] [--source <name>]
//                                [--director-usd <n>]
// Common: [--now <ISO>] [--config <file>] [--director <dir>] [--plan-usage <file>]
//
// Default: prints JSON with, per window, used_pct, budget_pct, remaining_pct, remaining_usd.
// --log-run appends this run's spend to director/runs.jsonl (at wrap-up).
// --record appends a reading to director/plan-readings.jsonl: the given percentages, or the live
// snapshot when none are given. With --director-usd the percentages are how much that spend used
// (say, one run's share of the window) rather than the window's total.
//
// How much of a window is used:
// - live: ~/.claude/plan-usage.json (scripts/statusline-snapshot.sh) is fresh and its window has
//   not reset. Its percentages count all usage on the account, the owner's included.
// - estimate (cloud runs, where that file never exists): the Director's own spend in the window
//   (director/runs.jsonl plus this run so far) divided by usd_per_pct. Only the Director's usage
//   counts, so the budget caps the Director's share and leaves the rest to the owner.
//
// usd_per_pct is the median over the most recent readings: each pairs the window's percent at a
// moment with the Director's spend inside that window. A reading also counts the owner's own use,
// which pushes usd_per_pct down (more cautious), never up. Without readings the prior in
// config.plan_budget is used.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildReport, findTranscripts, projectSlug } from "./usage.mjs";

const HOUR = 3_600_000;
export const WINDOWS = {
  five_hour: { ms: 5 * HOUR, reading: "five_hour_pct" },
  seven_day: { ms: 7 * 24 * HOUR, reading: "seven_day_pct" },
};
// Readings this small are mostly rounding, and dividing by them gives wild ratios.
const MIN_READING_PCT = 3;

export function readJsonl(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/** Milliseconds from an ISO string or Unix seconds (the status line's resets_at). */
export function toMs(t) {
  if (t === undefined || t === null || t === "") return NaN;
  if (typeof t === "number") return t * 1000;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) * 1000;
  return Date.parse(t);
}

/** Dollars of runs that started in [start, end): runs before the window would overstate it. */
export function spendStartedIn(runs, start, end) {
  return runs.filter((r) => toMs(r.start) >= start && toMs(r.start) < end).reduce((s, r) => s + (r.usd || 0), 0);
}

/** Dollars of runs that overlap [start, end): when budgeting, count a straddling run in full. */
export function spendOverlapping(runs, start, end) {
  return runs.filter((r) => toMs(r.end ?? r.start) > start && toMs(r.start) < end).reduce((s, r) => s + (r.usd || 0), 0);
}

/** Dollars per percent for one window: median over the latest usable readings, else the prior. */
export function usdPerPct({ window, readings, runs, prior, count }) {
  const { ms, reading: key } = WINDOWS[window];
  const ratios = [];
  for (const r of [...readings].sort((a, b) => toMs(a.at) - toMs(b.at))) {
    const pct = r[key];
    const at = toMs(r.at);
    if (typeof pct !== "number" || pct < MIN_READING_PCT || Number.isNaN(at)) continue;
    // resets_at reported with the reading is the 5-hour window's; other windows fall back to
    // the trailing window length.
    const resets = window === "five_hour" ? toMs(r.resets_at) : NaN;
    const start = Number.isNaN(resets) ? at - ms : resets - ms;
    // A reading of how much one run used (director_usd) needs no window spend: it is the ratio.
    const usd = typeof r.director_usd === "number" ? r.director_usd : spendStartedIn(runs, start, at);
    if (usd > 0) ratios.push(usd / pct);
  }
  const recent = ratios.slice(-count).sort((a, b) => a - b);
  if (recent.length === 0) return { usd_per_pct: prior, source: "prior", readings: 0 };
  const mid = Math.floor(recent.length / 2);
  const median = recent.length % 2 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
  return { usd_per_pct: median, source: "readings", readings: recent.length };
}

/** The live snapshot if it is recent and its 5-hour window hasn't reset, else null. */
export function liveSnapshot(snapshot, now, maxAgeMinutes) {
  if (!snapshot || !snapshot.updated_at) return null;
  const age = now - toMs(snapshot.updated_at);
  if (!(age >= 0 && age <= maxAgeMinutes * 60_000)) return null;
  for (const w of Object.keys(WINDOWS)) {
    const v = snapshot[w];
    if (v && toMs(v.resets_at) <= now) return null;
  }
  return snapshot;
}

export function budget({ config, runs, readings, snapshot, now, since, runUsd }) {
  const pb = config.plan_budget;
  const live = liveSnapshot(snapshot, now, pb.live_max_age_minutes);
  const sinceMs = since ? toMs(since) : now;
  // The current run isn't in runs.jsonl until wrap-up, and must not be counted twice if it is.
  const past = runs.filter((r) => toMs(r.start) < sinceMs);
  const out = { now: new Date(now).toISOString(), mode: live ? "live" : "estimate", run_usd: round(runUsd) };
  for (const w of Object.keys(WINDOWS)) {
    const budgetPct = pb[`${w}_pct`];
    const rate = usdPerPct({ window: w, readings, runs, prior: pb.usd_per_pct_prior[w], count: pb.readings_used });
    const windowUsd = spendOverlapping(past, now - WINDOWS[w].ms, now) + runUsd;
    const livePct = live?.[w]?.used_percentage;
    const usedPct = typeof livePct === "number" ? livePct : windowUsd / rate.usd_per_pct;
    const remainingPct = Math.max(0, budgetPct - usedPct);
    out[w] = {
      used_pct: round(usedPct, 1),
      used_from: typeof livePct === "number" ? "live" : "estimate",
      budget_pct: budgetPct,
      remaining_pct: round(remainingPct, 1),
      remaining_usd: round(remainingPct * rate.usd_per_pct),
      budget_usd: round(budgetPct * rate.usd_per_pct),
      director_usd_in_window: round(windowUsd),
      usd_per_pct: round(rate.usd_per_pct, 4),
      usd_per_pct_from: rate.source === "prior" ? "prior" : `median of ${rate.readings} readings`,
    };
  }
  out.remaining_usd = Math.min(out.five_hour.remaining_usd, out.seven_day.remaining_usd);
  return out;
}

function round(n, places = 2) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
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

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function fail(msg) {
  console.error(`plan-budget.mjs: ${msg}`);
  process.exit(2);
}

/** This run's spend so far from the transcripts, or --run-usd when they can't be read. */
function runSpend(args, here, prices) {
  if (args["run-usd"] !== undefined) {
    const v = Number(args["run-usd"]);
    if (Number.isNaN(v)) fail(`cannot parse --run-usd ${args["run-usd"]}`);
    return v;
  }
  if (!args.since) return 0;
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const { files } = findTranscripts({ root: path.join(base, "projects"), slug: projectSlug(path.join(here, "..")) });
  if (files.length === 0) fail("no transcripts found; pass --run-usd");
  return buildReport({ files, root: path.join(base, "projects"), prices, since: args.since }).overall.cost_usd;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const config = readJson(args.config || path.join(here, "..", "director", "config.json"));
  if (!config?.plan_budget) fail("config has no plan_budget");
  const dir = args.director || path.join(here, "..", "director");
  const runsFile = path.join(dir, "runs.jsonl");
  const readingsFile = path.join(dir, "plan-readings.jsonl");
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const snapshot = readJson(args["plan-usage"] || path.join(base, "plan-usage.json"));
  const now = args.now ? toMs(args.now) : Date.now();
  if (Number.isNaN(now)) fail(`cannot parse --now ${args.now}`);
  if (args.since && Number.isNaN(toMs(args.since))) fail(`cannot parse --since ${args.since}`);

  if (args.record) {
    const pct = (k) => (args[k] === undefined ? undefined : Number(args[k]));
    let row = { at: args.at || new Date(now).toISOString(), five_hour_pct: pct("five-hour"), seven_day_pct: pct("seven-day") };
    if (row.five_hour_pct === undefined && row.seven_day_pct === undefined) {
      const live = liveSnapshot(snapshot, now, config.plan_budget.live_max_age_minutes);
      if (!live) fail("no fresh plan-usage snapshot; pass --five-hour and/or --seven-day");
      row = {
        at: live.updated_at,
        five_hour_pct: live.five_hour?.used_percentage,
        seven_day_pct: live.seven_day?.used_percentage,
        resets_at: live.five_hour?.resets_at,
        source: "statusline",
      };
    } else {
      if (args["resets-at"]) row.resets_at = args["resets-at"];
      if (args["director-usd"] !== undefined) {
        row.director_usd = Number(args["director-usd"]);
        if (Number.isNaN(row.director_usd)) fail(`cannot parse --director-usd ${args["director-usd"]}`);
      }
      row.source = args.source || "owner";
    }
    if (Number.isNaN(toMs(row.at))) fail(`cannot parse --at ${row.at}`);
    fs.appendFileSync(readingsFile, JSON.stringify(row) + "\n");
    console.log(JSON.stringify(row));
    return;
  }

  const runUsd = runSpend(args, here, config.prices_per_mtok);
  if (args["log-run"]) {
    if (!args.since) fail("--log-run needs --since <run_start>");
    const row = { run_id: args["log-run"], start: args.since, end: new Date(now).toISOString(), usd: round(runUsd, 4) };
    fs.appendFileSync(runsFile, JSON.stringify(row) + "\n");
    console.log(JSON.stringify(row));
    return;
  }

  const result = budget({ config, runs: readJsonl(runsFile), readings: readJsonl(readingsFile), snapshot, now, since: args.since, runUsd });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
