# Product plan

## Vision

One app, two modes.

- **Play**: focused solving with excellent input and honest feedback. The signature feature is
  mistake analysis: when something goes wrong, the app finds the first move that diverged from the
  solution, explains why it happened, shows what was available instead, and lets you rewind to
  just before it and keep playing.
- **Display**: for a side monitor. A large clock and date, a beautifully rendered puzzle (the
  current game, or a slow self-solving "watch" puzzle with technique captions), and today's stats.
  Calm and low-CPU (no constant animation loops; the clock ticks once a second), burn-in safe
  (slow drift), and dimmer at night.

Not now: accounts, backend, sync, multiplayer, variants.

## Must have

1. **Difficulty**: Easy, Medium, Hard, Expert, Master. Every puzzle has exactly one solution.
   The level is the hardest technique a human-style solver needs:
   - Easy: naked and hidden singles.
   - Medium: adds locked candidates (pointing, claiming) and naked/hidden pairs.
   - Hard: adds naked/hidden triples and quads.
   - Expert: adds X-Wing, Swordfish, XY-Wing, XYZ-Wing, simple coloring.
   - Master: adds X-chains, XY-chains, W-Wing, unique rectangles, and never requires guessing.
   Within a level, puzzles are ordered by a step-weighted score (docs/ARCHITECTURE.md).
2. **Number entry**: cell-first (select a cell, then a digit) and digit-first (lock a digit, then
   tap cells). The pad shows how many of each digit remain and dims finished digits. Notes toggle
   by button, the N key, or holding Shift. Placing a digit removes it from peers' notes. Optional
   auto-candidates, logged as an assist. Keyboard: arrows, WASD, or hjkl move; 1-9 place; 0,
   Backspace, or Delete erase; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl+Y redo; H hint; P pause;
   ? shows shortcuts. Touch targets at least 44px.
3. **Highlighting**: the selected cell's row, column, and box; every cell with the same digit;
   conflicts. Never rely on color alone.
4. **Undo and redo** without limit. Reset (restart this puzzle, after a confirm) is itself an
   undoable event. New game asks for a difficulty.
5. **Timer** pauses when the tab is hidden or on Pause, and Pause hides the grid. A wall clock
   shows wherever there's room (desktop side panel, Display mode) and hides on narrow phones.
6. **Check vs Submit**. Check is non-final: "on track?", an error count, optional highlighting (a
   setting), logged as an assist. Submit is final: grade plus analysis. Auto-submit when the grid
   is full and correct.
7. **Mistake analysis**. Replay the event history against the solution and report:
   - root mistake: the first event that diverged from the solution (a wrong placement, or a note
     edit that removed the true digit from a cell);
   - diagnosis at that moment: a rule conflict already visible; ruled out by a deduction (name the
     technique and cells); a guess (no logical step within the puzzle's grade was available); a
     likely typo (fast entry, neighboring pad key); or a consequence of an earlier mistake;
   - what was available instead: the simplest deduction available just before that move;
   - cascade: later moves that depended on it;
   - actions: highlight it on the board, step through a timeline, rewind to just before it and
     keep playing (history preserved).
   On a correct solve: time breakdown, longest stalls, hardest technique used, assists used.
8. **Theme**: Light, Dark, System, persisted. Colors as CSS custom properties.
9. **Layouts**: phone portrait (grid on top, pad in the thumb zone), phone landscape (grid plus
   side pad), tablet, desktop (grid plus a side panel with timer, clock, controls, move history),
   and Display mode on landscape and portrait monitors. Container queries. Never scroll
   horizontally.
10. **Autosave** after every event, resume on reload, persist settings.

## Should have

Tiered hints (nudge, technique name, reveal); a daily puzzle seeded by date; stats per difficulty
(solved, best and average time, streak, mistake rate); PWA (offline, installable window);
fullscreen and keep-screen-awake toggles in Display mode; idle switches to Display mode after N
minutes and pauses the game; share or import a puzzle as an 81-character string or URL;
accessibility (keyboard-only play, screen-reader labels, visible focus, reduced motion); a
left-handed layout; a subtle completion animation.

## Technical defaults

Vite, TypeScript (strict), React, plain CSS with custom properties, no backend. Engine in pure
TypeScript; event-sourced game store; generation and analysis in a Web Worker; a pre-generated
puzzle bank with runtime top-up. Vitest with fast-check for the engine; Playwright e2e at 390x844
and 1440x900 with axe checks. GitHub Actions CI; a GitHub Pages deploy workflow that stays
disabled until hosting is confirmed (director/QUESTIONS.md). Details: docs/ARCHITECTURE.md.

## Milestones

Dependencies: M1 needs M0; M2 and M4 need M1; M3 needs M2; M5 needs M4; M6 needs M5; M7 needs M2
and M5; M8 needs M7; M9 needs M3 and M6; M10 needs M8 and M9.

```
M0 ─ M1 ─┬─ M2 ─┬─ M3 ──────────────┐
         │      └──────────┐        ├─ M9 ─┐
         └─ M4 ─ M5 ─┬─ M6 ┼────────┘      ├─ M10
                     └─────┴─ M7 ─ M8 ─────┘
```

| Milestone | Goal | Done when |
|---|---|---|
| **M0 Foundation** | Scaffold, tooling, docs, director, walking skeleton. | Done at setup: board renders a hardcoded puzzle, selection and entry work, theme toggles, engine parses and validates; check, build, e2e green. |
| **M1 Engine core** | PRNG, fast solver with solution counting, candidate state, the Step type, puzzle codec. | Uniqueness checks are fast and property-tested; the human-solver scaffolding is in place. |
| **M2 Logical solver and grader** | Every technique in the tier table, the step driver, the grader and score. | Reference puzzles grade into the expected level; property tests show no step eliminates a solution digit. |
| **M3 Generator and puzzle bank** | Generator into a band, worker, bank script and committed bank, runtime loader and top-up. | Each level has a bank; new games load instantly; the worker tops up when needed. |
| **M4 Game state** | Event-sourced store, undo/redo/reset/rewind tree, timer, settings, autosave. | The skeleton reducer is gone; reload resumes exactly; undo/redo are property-tested. |
| **M5 Board and input** | Notes, both entry modes, the full keyboard map, highlighting, pause, new game, reset. | Must-haves 2-5 work end to end with e2e coverage. |
| **M6 Layouts, theming, accessibility** | All layouts with container queries, side panel, wall clock, left-handed mode, a11y. | Phone, tablet and desktop layouts pass e2e and axe in both themes. |
| **M7 Check, Submit, mistake analysis** | Check, Submit, auto-submit, analysis engine and report UI with timeline and rewind. | A scripted wrong game produces the correct root, diagnosis, alternative and cascade, and rewind works. |
| **M8 Hints** | Tiered hints from the step driver. | Hints never contradict the solution and point to mistakes first. |
| **M9 Display mode and PWA** | Display view, watch puzzle, drift and dimming, fullscreen and wake lock, idle switch, PWA. | Display runs for hours at low CPU; the app works offline and installs. |
| **M10 Stats, daily, polish, deploy** | Stats, daily puzzle, share/import, completion animation, copy, README, regression sweep, deploy. | Feature-complete, documented, deployed once hosting is answered. |
