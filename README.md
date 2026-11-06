# Browser Sudoku

A Sudoku app that runs entirely in the browser. It is a static site: no backend, no accounts,
no sync. Games and settings are saved in the browser, so a reload resumes where you left off.

The app has two modes:

- **Play** is for solving, and is deliberately minimal: the board, New game, a theme switch,
  Undo, Check, and an Easy / Medium / Hard assistance switch. Every puzzle has exactly one
  solution and comes in five levels (Easy, Medium, Hard, Expert, Master), each defined by the
  hardest technique a human solver needs. Touch screens get a 1-9 pad; computers type.
- **Display** is for a side monitor. It shows a large clock and date, a rendered puzzle (the
  current game, read only), and today's
  stats. It is calm and low-CPU: the clock ticks once a second and there are no constant
  animations.

Product context and milestones are in [docs/PLAN.md](docs/PLAN.md). Modules, data flow and the
analysis algorithm are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Playing

Select a cell, then enter a digit: type it on a computer, or tap the 1-9 pad on a phone or tablet
(the pad only appears on touch screens). The selected cell's row, column and box are highlighted
and every cell with the same digit is marked. Highlights never rely on color alone.

Below the board:

- **Undo** steps back one move (no limit; Ctrl/Cmd+Shift+Z or Ctrl+Y redo).
- **Check** reports "On track" or an error count and marks the wrong cells until your next edit.
  It never shows the right digit.
- **Assistance** is a three-position switch, remembered between visits:
  - **Easy**: a Hint button, plus everything in Medium. Each press goes one step further, and the
    button says what comes next: **Hint** points at where to look, **More help** names the technique
    and says in a sentence what it means, and **Show answer** gives the full step with a **Fill it
    in** button. The panel counts the steps ("Hint 2 of 3"), a hint about one cell selects that cell
    so you can type straight away, and ✕ or Esc closes it. The solved message says how many hints
    you used.
  - **Medium** (default): a wrong digit is marked the moment you place it, and repeated digits in a
    row, column or box are flagged.
  - **Hard**: no help at all until you press Check.

A correct full grid finishes the game by itself and shows your solve time.

### Keyboard

| Keys | Action |
|---|---|
| Arrows, W A S D, H J K L | Move the selection |
| 1-9 | Place a digit (toggles a note in notes mode) |
| Shift+1-9 | Toggle a note |
| N | Toggle notes mode |
| 0, Backspace, Delete | Erase the cell |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z, Ctrl+Y | Redo |
| Shift+H | Hint, on Easy (capital H; plain h moves left) |

Notes are a keyboard feature; the touch layout keeps to the 1-9 pad.

### Display mode

Display is meant for a second screen or a wall display. Open it at `?mode=display` (Play has no
button for it). It shows the clock, the puzzle and today's stats, drifts slowly to avoid burn-in,
and dims at night. Fullscreen and keep-screen-awake
toggles are part of the Display spec in docs/PLAN.md.

### Light and dark

The sun/moon button in the header (and in Display mode) switches between light and dark in one
tap. Until you use it, the app follows the device.

### Spotify now playing (optional)

Display mode can show what's playing on your Spotify account (on any device): cover, title,
artist, album, a progress bar, and previous / play-pause / next. Reading works on any account;
the playback buttons need Spotify Premium and are disabled, with a note, on free accounts.
Turn it on or off with **Spotify: on/off** in Display mode.

One-time setup:

1. At [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), create an app
   (any name; tick "Web API").
2. Open Display mode and press **Settings**. Under Spotify, the hint shows this page's address: add exactly that as a
   Redirect URI in the Spotify app. Spotify doesn't accept `localhost`; when running locally, open
   the app at `http://127.0.0.1:<port>/` and register that.
3. Paste the app's Client ID into those Settings, then press **Connect Spotify** and approve.

Sign-in uses Authorization Code with PKCE, so there is no secret and no server: tokens stay in
this browser and are sent only to Spotify. While Spotify is in development mode, only accounts
you add under the app's User Management can sign in.

## Deploy (Cloudflare)

The app is a static folder, so any static host works. It is set up for Cloudflare Workers static
assets (`wrangler.jsonc` uploads `dist/`):

1. Cloudflare dashboard > Workers & Pages > Create > import this Git repo. Project name `sudoku`
   (it must match `name` in `wrangler.jsonc`).
2. Build command `npm run build`, deploy command `npx wrangler deploy`. Every push to `main` then
   deploys automatically; preview builds give other branches their own test URL.
3. Settings > Domains & Routes > add a custom domain, e.g. `sudoku.example.com`. With the
   domain's DNS on Cloudflare, the record and HTTPS certificate are created for you.

`public/_headers` makes the service worker and page revalidate on every visit, so players get a
new deploy on their next load, while fingerprinted assets cache for a year. Paths are relative,
so a subfolder such as `example.com/sudoku/` also works. For Spotify, register the deployed
address (e.g. `https://sudoku.example.com/`) as a Redirect URI.

## Develop, test and build

Requires Node 22 or newer.

```sh
npm install                        # install dependencies
npx playwright install chromium    # one-time browser install for e2e tests
npm run dev                        # dev server
npm run check                      # lint (ESLint), typecheck (tsc), unit tests (Vitest)
npm run build                      # production build to dist/
npm run e2e                        # Playwright at 390x844 (touch) and 1440x900, with axe checks
npm run gen:bank                   # regenerate the puzzle bank in public/puzzles/
npm run test:slow                  # slow generator suite (Hard headroom check); run as its own CI job
```

`npm run e2e` builds and serves the app itself, so you do not need to run `build` or `dev` first.

### Layout of the code

```
src/engine/      pure Sudoku logic (solver, candidates, grading, puzzle codec)
src/analysis/    pure replay analysis: mistakes, solve stats, hints
src/state/       event-sourced game store, timer, settings, persistence
src/workers/     engine worker and its typed client
src/ui/          React app: components, layouts, Display mode, theme, styles.css
e2e/             Playwright specs
scripts/         puzzle bank generator and other tooling
public/puzzles/  generated puzzle bank
```

Grids are 81-element arrays, indexed `row * 9 + col`, with `0` for an empty cell. Engine logic
has no DOM, React or storage dependencies, and its randomness comes only from the seeded PRNG,
so tests are reproducible. Unit tests sit next to the code as `*.test.ts(x)`, and engine
invariants are covered by fast-check property tests.

Colors are defined only as custom properties in `src/ui/styles.css`, with light and dark
values. Layouts use container queries, and the app never scrolls horizontally.

## Automation

Parts of this repository are maintained by an automated Director that dispatches backlog tasks
to subagents. See [director/README.md](director/README.md) for how that works.
