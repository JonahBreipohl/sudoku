// Visible copy lives here so wording can be reviewed in one place. The e2e specs match some of
// these strings, so change a value only together with the spec that relies on it.

export const common = {
  on: "On",
  off: "Off",
  cancel: "Cancel",
  keepPlaying: "Keep playing",
  close: "Close",
};

export const controls = {
  group: "Game controls",
  undo: "Undo",
  redo: "Redo",
  reset: "Reset",
  pause: "Pause",
  notes: "Notes:",
  shiftSuffix: " (Shift)",
  digitFirst: "Digit-first:",
  fillNotes: "Fill notes",
  autoCandidates: "Auto-candidates:",
  check: "Check",
  submit: "Submit",
  viewResult: "View result",
  submitTitle: "Submit this puzzle?",
  submitMessage: "Submitting is final: the clock stops and the board is locked.",
  resetTitle: "Reset this puzzle?",
  resetMessage: "This clears every digit and note back to the givens. You can undo the reset afterwards.",
  resetConfirm: "Reset",
};

export const newGame = {
  group: "New game",
  button: "New game",
  generating: "Generating…",
  abandonTitle: "Abandon this game?",
  abandonConfirm: "Abandon and start new",
  dailyTarget: "the daily puzzle",
  newLevelTarget: (level: string) => `a new ${level} game`,
  abandonMessage: (target: string) =>
    `Starting ${target} discards your progress on this puzzle. It is kept in your history as abandoned.`,
};

export const newGameDialog = {
  title: "Choose a difficulty",
  dailySolved: "Daily puzzle solved today. Next one tomorrow.",
  daily: (level: string) => `Daily puzzle (${level} today)`,
  legend: "Difficulty",
  start: "Start game",
};

export const hint = {
  button: "Hint",
  panel: "Hint",
  apply: "Apply",
};

export const pause = {
  region: "Game paused",
  title: "Paused",
  resume: "Resume",
};

export const submitDialog = {
  solved: "Solved",
  notSolved: "Not solved yet",
  solvedMessage: "Every cell is correct. The clock has stopped.",
  incorrectMessage: (summary: string) => `Your submission has ${summary}.`,
  analyze: "Analyze mistakes",
};

export const settings = {
  title: "Settings",
  theme: "Theme",
  themeLabels: { system: "System", light: "Light", dark: "Dark" },
  entryMode: "Entry mode",
  cellFirst: "Cell first",
  digitFirst: "Digit first",
  autoCandidates: { label: "Auto candidates", hint: "Fill pencil notes automatically." },
  checkHighlighting: {
    label: "Highlight wrong cells on Check",
    hint: "Check marks each wrong entry with a cross and frame.",
  },
  showTimer: { label: "Show timer", hint: "Display the solve clock while playing." },
  wallClock: { label: "Wall clock in Display mode", hint: "Show the time of day." },
  leftHanded: {
    label: "Left-handed layout",
    hint: "Mirror the pad and side panel to the left in landscape and desktop layouts.",
  },
  idleMinutes: "Idle minutes before Display mode",
  idleOff: "0 turns it off.",
};

export const pad = {
  group: "Number pad",
  notesGroup: "Number pad, notes mode",
  erase: "Erase",
  complete: "complete",
  remaining: (n: number) => `${n} remaining`,
};

export const clock = {
  label: "Clock",
};

export const timeline = {
  group: "Move timeline",
  now: " (now)",
  start: "Start",
  previous: "Previous move",
  next: "Next move",
  slider: "Move",
  jumpToMistake: "Jump to mistake",
  backToNow: "Back to now",
};

export const share = {
  title: "Share this puzzle",
  puzzleString: "Puzzle string",
  link: "Link",
  copy: "Copy",
  copied: (label: string) => `${label} copied.`,
  blocked: (label: string) =>
    `Copy was blocked. The ${label.toLowerCase()} is selected: press Ctrl+C (Cmd+C on Mac).`,
  done: "Done",
};

export const shortcuts = {
  title: "Keyboard shortcuts",
  close: "Close",
};

export const sidePanel = {
  label: "Game info",
  time: "Time",
  elapsed: "Elapsed time",
};

export const history = {
  title: "Moves",
  scroll: "Move history, newest first",
  empty: "No moves yet.",
  undone: "undone",
  now: "now",
  branchPoint: "branch point",
  start: "Start",
};

export const stats = {
  title: "Statistics",
  none: "None yet",
  solved: "Solved",
  bestTime: "Best time",
  averageTime: "Average time",
  streak: "Streak",
  oneDay: "1 day",
  days: (n: number) => `${n} days`,
  mistakes: "Games with a mistake",
  mistakeRate: (pct: number, games: number, solved: number) => `${pct}% (${games} of ${solved})`,
  daily: "Daily puzzle",
  dailyStreak: "Daily streak",
  close: "Close",
};

export const importDialog = {
  title: "Import a puzzle",
  field: "Puzzle string or link",
  checking: "Checking…",
  submit: "Import",
};

/** Player-facing wording for each import failure; each says what to fix. */
export const importErrors: Record<string, string> = {
  "wrong-length": "A puzzle needs exactly 81 cells (digits, with . or 0 for blanks).",
  "invalid-characters": "Only the digits 0-9 and . are allowed in a puzzle.",
  "rule-conflict": "Two equal digits share a row, column or box in this puzzle.",
  "no-solution": "This puzzle has no solution.",
  "multiple-solutions": "This puzzle has more than one solution, so it cannot be played.",
  ungradable: "This puzzle is valid but too hard for the built-in grader, so it cannot be rated.",
  worker: "The puzzle could not be checked. Please try again.",
};
