// Plain-words copy for the analysis report. Kept apart from the component so every diagnosis
// type can be unit tested without rendering. The sentences themselves live in strings.ts.

import { cellName, techniqueInfo } from "../engine";
import type { CascadeMove, MistakeReport } from "../analysis/report";
import type { SolveReport } from "../analysis/solve";
import { analysis, analysisCopy } from "./strings";

type Root = NonNullable<MistakeReport["root"]>;

const list = (cells: readonly number[]): string => cells.map(cellName).join(", ");

/** What the player did, e.g. "You placed 4 in r3c5." */
export function describeMistake(m: Root["mistake"]): string {
  return m.kind === "removed-solution-note"
    ? analysisCopy.mistakeNoteOff(m.digit, cellName(m.cell), m.solutionDigit)
    : analysisCopy.mistakePlaced(m.digit, cellName(m.cell), m.solutionDigit);
}

/** Why it was wrong, in a sentence or two. */
export function describeDiagnosis(root: Root): string {
  const { mistake: m, diagnosis: d } = root;
  const cell = cellName(m.cell);
  switch (d.kind) {
    case "consequence":
      return analysisCopy.consequence(cellName(d.wrongCell), cell);
    case "conflict":
      return analysisCopy.conflict(m.digit, list(d.conflictCells), cell);
    case "typo":
      return analysisCopy.typo(
        (d.gapMs / 1000).toFixed(1),
        m.digit,
        d.intended,
        analysisCopy.layout[d.layout] ?? analysisCopy.layout.keys ?? "",
      );
    case "guess":
      return d.stepsTried === 0
        ? analysisCopy.guessNoStep(cell)
        : analysisCopy.guessStalled(d.stepsTried, cell);
    case "deduction": {
      const name = techniqueInfo(d.step.technique).name;
      return d.outcome === "placed"
        ? analysisCopy.deductionPlaced(name, m.solutionDigit, cell, d.step.explanation)
        : analysisCopy.deductionEliminated(name, m.digit, cell, d.step.explanation);
    }
  }
}

/** The step that was available instead, or a line saying none applied. */
export function describeAlternative(alt: MistakeReport["alternative"]): string {
  if (!alt) return analysis.noAlternative;
  return analysisCopy.alternative(techniqueInfo(alt.technique).name, alt.explanation);
}

export function describeCascade(c: CascadeMove): string {
  const cell = cellName(c.cell);
  const dependsOn = cellName(c.dependsOn);
  return c.move === "note"
    ? analysisCopy.cascadeNote(c.digit, cell, dependsOn)
    : analysisCopy.cascadePlacement(c.digit, cell, !!c.wrong, dependsOn);
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? analysisCopy.minutes(m, s % 60) : analysisCopy.seconds(s);
}

/** Lines of the correct-solve analysis. */
export function solveSummary(r: SolveReport): { label: string; value: string }[] {
  const rows = [
    { label: analysisCopy.activeTime, value: formatDuration(r.time.activeMs) },
    { label: analysisCopy.pausedTime, value: formatDuration(r.time.pausedMs) },
    {
      label: analysisCopy.byPhase,
      value: r.time.phases
        .map((p, i) => analysisCopy.phaseTime(analysisCopy.phases[i] ?? "", formatDuration(p)))
        .join(", "),
    },
    {
      label: analysisCopy.hardest,
      value: r.hardest
        ? analysisCopy.hardestAt(techniqueInfo(r.hardest.technique).name, cellName(r.hardest.cell))
        : analysisCopy.noneNeeded,
    },
  ];
  const { checks, hints, autoNotes, reveals } = r.assists;
  const hintCount = hints.nudge + hints.technique + hints.reveal;
  const used = [
    checks && analysisCopy.check(checks),
    hintCount > 0 && analysisCopy.hints(hintCount),
    autoNotes && analysisCopy.autoNotes(autoNotes),
    reveals && analysisCopy.revealed(reveals),
  ].filter(Boolean);
  rows.push({ label: analysisCopy.assists, value: used.length ? used.join(", ") : analysisCopy.none });
  return rows;
}

export function describeStall(s: SolveReport["stalls"][number]): string {
  const time = formatDuration(s.durationMs);
  return s.available
    ? analysisCopy.stallWithAlternative(
        time,
        techniqueInfo(s.available.technique).name,
        s.available.explanation,
      )
    : analysisCopy.beforeYourMove(time);
}
