#!/usr/bin/env bash
# Claude Code status line command that also snapshots plan usage for the Director.
#
# Claude Code pipes a JSON object to this script on stdin. On Pro and Max plans, after the first
# response, it includes rate_limits.five_hour and rate_limits.seven_day, each with
# used_percentage (0-100) and resets_at (Unix epoch seconds). This script writes those, plus
# updated_at (ISO time), to ~/.claude/plan-usage.json and prints a short status line.
# The Director reads that file to avoid starting work near the plan's limits.
#
# Enable it in your user settings (~/.claude/settings.json); see director/README.md.

input=$(cat)

STATUSLINE_INPUT="$input" node -e '
const fs = require("fs");
const os = require("os");
const path = require("path");

let data = {};
try { data = JSON.parse(process.env.STATUSLINE_INPUT || "{}"); } catch {}

const limits = data.rate_limits || {};
const pick = (w) => (w && typeof w.used_percentage === "number"
  ? { used_percentage: w.used_percentage, resets_at: w.resets_at } : undefined);
const snapshot = { five_hour: pick(limits.five_hour), seven_day: pick(limits.seven_day) };

if (snapshot.five_hour || snapshot.seven_day) {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const file = path.join(base, "plan-usage.json");
  const tmp = file + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify({ ...snapshot, updated_at: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, file);
  } catch {}
}

const parts = [data.model && data.model.display_name ? data.model.display_name : "Claude"];
if (snapshot.five_hour) parts.push("5h " + Math.round(snapshot.five_hour.used_percentage) + "%");
if (snapshot.seven_day) parts.push("7d " + Math.round(snapshot.seven_day.used_percentage) + "%");
process.stdout.write(parts.join(" · "));
'
