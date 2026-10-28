// Visible copy lives here so wording can be reviewed in one place. The e2e specs match some of
// these strings, so change a value only together with the spec that relies on it.

export const common = {
  on: "On",
  off: "Off",
  cancel: "Cancel",
  keepPlaying: "Keep playing",
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
