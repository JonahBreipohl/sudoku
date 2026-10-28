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
