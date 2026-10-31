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
  haptics: { label: "Haptics", hint: "Light vibration on phones when you place digits, hit conflicts or finish." },
  idleMinutes: "Idle minutes before Display mode",
  idleOff: "0 turns it off.",
  nowPlaying: { label: "Spotify in Display mode", hint: "Show what's playing, with play, pause and skip." },
  spotify: "Spotify",
  clientId: "Client ID",
  clientIdHint: "From your app at developer.spotify.com. Add this page as a Redirect URI there:",
  clientIdInvalid: "A client ID is 32 letters and digits.",
  localhostNote: "Spotify doesn't accept localhost: open this page at 127.0.0.1 instead.",
  connect: "Connect Spotify",
  disconnect: "Disconnect Spotify",
  connected: "Connected.",
};

export const themeToggle = {
  label: "Dark mode",
  toDark: "Switch to dark mode",
  toLight: "Switch to light mode",
};

export const spotify = {
  label: "Now playing on Spotify",
  toggleOn: "Spotify: on",
  toggleOff: "Spotify: off",
  needsClientId: "Add your Spotify client ID in Settings to show what's playing.",
  connect: "Connect Spotify",
  loading: "Connecting to Spotify…",
  idle: "Nothing playing on Spotify.",
  error: "Spotify isn't responding. Trying again.",
  progress: "Track progress",
  of: "of",
  previous: "Previous track",
  next: "Next track",
  play: "Play",
  pause: "Pause",
  onDevice: (name: string) => `On ${name}`,
  notices: {
    premium: "Play, pause and skip need Spotify Premium.",
    noDevice: "Open Spotify on a device first.",
    failed: "Spotify didn't respond. Try again.",
  },
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

/** Owner homepage; the only place the host appears, so a different host is a one-line change. */
export const HOME_URL = "https://jonahbreipohl.com/";

export const app = {
  title: "Sudoku",
  homeLink: "← Jonah Breipohl",
  homeMenuLabel: "Jonah Breipohl (home)",
  more: "More",
  moreMenuLabel: "More actions",
  hintFailed: "Hint could not be computed. Please try again.",
  abandonImportTitle: "Abandon this game?",
  abandonImportConfirm: "Abandon and import",
  abandonImportMessage: (level: string) =>
    `Starting the imported ${level} puzzle discards your progress on this puzzle. It is kept in your history as abandoned.`,
};

export const analysis = {
  label: "Analysis",
  title: "Analysis",
  close: "Close analysis",
  analysing: "Analysing your game…",
  retry: "Try again",
  timeline: "Timeline",
  rewindGroup: "Rewind and keep playing",
  rewindBefore: "Rewind to before the mistake",
  rewindHere: "Rewind to this move and play on",
  pauses: "Longest pauses in thinking",
  couldHaveDone: "What you could have done",
  ledTo: "What it led to",
  noAlternative: "No step at your level was available at that point.",
  noMistakes: "No mistakes on this path.",
  checkMark: "✓ ",
  mistakeMark: "! ",
  firstMistake: (cell: string) => `First mistake: ${cell}`,
  keyRoot: "Mistake cell (solid frame, “!”)",
  keyReasonCells: (cells: string) => `Reason cells: ${cells}`,
  keyReasonFrame: "(dashed frame, “◆”)",
  you: "You ",
  totalMistakes: (n: number) => `${n} mistakes in total; later ones often follow from the first.`,
};

/** Labels for the analysis report's facts and the solve breakdown. */
export const analysisCopy = {
  layout: {
    pad: "the on-screen pad",
    "number-row": "the number row",
    numpad: "the numpad",
    keys: "the keys",
  } as Record<string, string>,
  activeTime: "Active time",
  pausedTime: "Paused time",
  byPhase: "By phase",
  phases: ["Start", "Middle", "End"],
  hardest: "Hardest technique",
  noneNeeded: "None needed",
  assists: "Assists",
  none: "None",
  check: (n: number) => `${n} ${n === 1 ? "check" : "checks"}`,
  hints: (n: number) => `${n} hints`,
  autoNotes: (n: number) => `${n} auto-notes`,
  revealed: (n: number) => `${n} revealed`,
  beforeYourMove: (time: string) => `${time} before your move`,
  stallWithAlternative: (time: string, technique: string, explanation: string) =>
    `${time} before your move; available: ${technique}. ${explanation}`,
  minutes: (m: number, s: number) => `${m} min ${s} s`,
  seconds: (s: number) => `${s} s`,
  phaseTime: (phase: string, time: string) => `${phase} ${time}`,
  hardestAt: (technique: string, cell: string) => `${technique} (${cell})`,
  alternative: (technique: string, explanation: string) => `${technique}: ${explanation}`,
  mistakePlaced: (digit: number, cell: string, right: number) =>
    `You placed ${digit} in ${cell}. The right answer is ${right}.`,
  mistakeNoteOff: (digit: number, cell: string, right: number) =>
    `You turned off note ${digit} in ${cell}. The right answer there is ${right}.`,
  consequence: (wrongCell: string, cell: string) =>
    `This followed from an earlier wrong digit in ${wrongCell}, which hid the answer for ${cell}.`,
  conflict: (digit: number, cells: string, cell: string) =>
    `${digit} was already placed in ${cells}, which shares a row, column or box with ${cell}.`,
  typo: (gapSeconds: string, digit: number, intended: number, layout: string) =>
    `Looks like a slip of the finger: it came ${gapSeconds} s after your last move, and ${digit} is next to ${intended} on ${layout}.`,
  guessNoStep: (cell: string) => `No step at your level led to ${cell}, so this was a guess.`,
  guessStalled: (steps: number, cell: string) =>
    `Logic at your level ran out after ${steps} ${steps === 1 ? "step" : "steps"} without settling ${cell}, so this was a guess.`,
  deductionPlaced: (technique: string, digit: number, cell: string, explanation: string) =>
    `${technique} showed that ${digit} must go in ${cell}: ${explanation}`,
  deductionEliminated: (technique: string, digit: number, cell: string, explanation: string) =>
    `${technique} showed that ${digit} cannot go in ${cell}: ${explanation}`,
  cascadeNote: (digit: number, cell: string, dependsOn: string) =>
    `turned off note ${digit} in ${cell}, hidden by ${dependsOn}`,
  cascadePlacement: (digit: number, cell: string, wrong: boolean, dependsOn: string) =>
    `placed ${digit} in ${cell}${wrong ? " (also wrong)" : ""}, hidden by ${dependsOn}`,
};

export const display = {
  heading: "Display mode",
  exit: "Exit",
  boardLabel: "Current game, read only",
  watchLabel: "Watch puzzle, solving itself",
  newPuzzle: "New puzzle",
  solved: "Solved",
  noFurtherStep: "No further step",
  fullscreenOn: "Fullscreen: on",
  fullscreenOff: "Fullscreen: off",
  keepAwakeOn: "Keep awake: on",
  keepAwakeWaiting: "Keep awake: waiting",
  keepAwakeOff: "Keep awake: off",
  statsLabel: "Today's stats",
  solvedToday: "Solved today",
  totalTime: "Total time",
  bestTime: "Best time",
  streak: "Streak",
  day: "day",
  days: "days",
  none: "–",
};

/** Accessible names for the board grid. */
export const boardLabels = {
  grid: "Sudoku board",
  preview: "Sudoku board, preview of an earlier move",
};

/** Accessible name parts for one cell; joined in Cell.tsx so the order stays fixed. */
export const cellLabels = {
  position: (row: number, col: number) => `Row ${row}, column ${col}`,
  given: "given",
  empty: "empty",
  notes: (digits: string) => `notes ${digits}`,
  conflict: "conflict",
  wrong: "wrong",
  mistake: "mistake",
  reasonForMistake: "reason for mistake",
};
