// Plain-words copy for the analysis report. Kept apart from the component so every diagnosis
// type can be unit tested without rendering.

import { cellName, techniqueInfo } from "../engine";
import type { CascadeMove, MistakeReport } from "../analysis/report";
import type { SolveReport } from "../analysis/solve";

type Root = NonNullable<MistakeReport["root"]>;

const list = (cells: readonly number[]): string => cells.map(cellName).join(", ");

const LAYOUT: Record<string, string> = { pad: "the on-screen pad", "number-row": "the number row", numpad: "the numpad" };

/** What the player did, e.g. "You placed 4 in r3c5." */
export function describeMistake(m: Root["mistake"]): string {
  return m.kind === "removed-solution-note"
    ? `You turned off the note ${m.digit} in ${cellName(m.cell)}, but ${m.solutionDigit} was the right answer there.`
    : `You placed ${m.digit} in ${cellName(m.cell)}, but the right answer is ${m.solutionDigit}.`;
}

/** Why it was wrong, in a sentence or two. */
export function describeDiagnosis(root: Root): string {
  const { mistake: m, diagnosis: d } = root;
  const cell = cellName(m.cell);
  switch (d.kind) {
    case "consequence":
      return `An earlier wrong digit in ${cellName(d.wrongCell)} was hiding the answer for ${cell}, so this followed from that earlier mistake.`;
    case "conflict":
      return `${m.digit} was already placed in ${list(d.conflictCells)}, which sees ${cell}. The conflict was visible on the board.`;
    case "typo":
      return `This looks like a slip of the finger: it came ${(d.gapMs / 1000).toFixed(1)} s after your previous move, and ${m.digit} is next to ${d.intended} on ${LAYOUT[d.layout] ?? "the keys"}.`;
    case "guess":
      return d.stepsTried === 0
        ? `No step at your level led to ${cell} at that point, so this was a guess.`
        : `Logic at your level ran out after ${d.stepsTried} ${d.stepsTried === 1 ? "step" : "steps"} without settling ${cell}, so this was a guess.`;
    case "deduction": {
      const how =
        d.outcome === "placed"
          ? `${m.solutionDigit} had to go in ${cell}`
          : `${m.digit} could not go in ${cell}`;
      return `${techniqueInfo(d.step.technique).name} showed that ${how}: ${d.step.explanation}`;
    }
  }
}

/** The step that was available instead, or a line saying none applied. */
export function describeAlternative(alt: MistakeReport["alternative"]): string {
  if (!alt) return "No step at your level was available at that point.";
  return `${techniqueInfo(alt.technique).name}: ${alt.explanation}`;
}

export function describeCascade(c: CascadeMove): string {
  const what = c.move === "note" ? `turned off note ${c.digit} in` : `placed ${c.digit} in`;
  return `${what} ${cellName(c.cell)}${c.wrong ? " (also wrong)" : ""}, hidden by ${cellName(c.dependsOn)}`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

/** Lines of the correct-solve analysis. */
export function solveSummary(r: SolveReport): { label: string; value: string }[] {
  const rows = [
    { label: "Active time", value: formatDuration(r.time.activeMs) },
    { label: "Paused time", value: formatDuration(r.time.pausedMs) },
    {
      label: "By phase",
      value: r.time.phases.map((p, i) => `${["Start", "Middle", "End"][i]} ${formatDuration(p)}`).join(", "),
    },
    {
      label: "Hardest technique",
      value: r.hardest ? `${techniqueInfo(r.hardest.technique).name} (${cellName(r.hardest.cell)})` : "None needed",
    },
  ];
  const { checks, hints, autoNotes, reveals } = r.assists;
  const used = [
    checks && `${checks} ${checks === 1 ? "check" : "checks"}`,
    hints.nudge + hints.technique + hints.reveal > 0 &&
      `${hints.nudge + hints.technique + hints.reveal} hints`,
    autoNotes && `${autoNotes} auto-notes`,
    reveals && `${reveals} revealed`,
  ].filter(Boolean);
  rows.push({ label: "Assists", value: used.length ? used.join(", ") : "None" });
  return rows;
}

export function describeStall(s: SolveReport["stalls"][number]): string {
  const base = `${formatDuration(s.durationMs)} before your move`;
  return s.available ? `${base}; available: ${techniqueInfo(s.available.technique).name}. ${s.available.explanation}` : base;
}
