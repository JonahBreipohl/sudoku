import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { SAMPLE_EASY } from "../src/engine/samples";
import { expect, test } from "./fixtures";

const cell = (n: number) => `[data-cell="${n}"]`;

/** Opens the New game dialog and starts the default level. */
async function startNewGame(page: Page) {
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

test("renders 81 cells with givens", async ({ page }) => {
  await expect(page.locator("[data-cell]")).toHaveCount(81);
  await expect(page.locator(cell(0))).toHaveText("5");
  await expect(page.locator(cell(0))).toHaveAttribute("aria-label", "Row 1, column 1, 5, given");
});

test("selects by click and moves with arrow keys", async ({ page }) => {
  await page.locator(cell(2)).click();
  await expect(page.locator(cell(2))).toHaveClass(/cell--selected/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(cell(11))).toHaveClass(/cell--selected/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(cell(12))).toHaveClass(/cell--selected/);
});

test("enters digits from the keyboard and erases", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.keyboard.press("Backspace");
  await expect(page.locator(cell(2))).toHaveText("");
});

test("the 1-9 pad shows on touch screens only; a computer gets the typing hint instead", async ({ page }, info) => {
  const pad = page.getByRole("group", { name: "Number pad" });
  const hint = page.locator(".keys-hint");
  if (info.project.name !== "phone") {
    await expect(pad).toBeHidden();
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Type 1–9");
    return;
  }
  await expect(hint).toBeHidden();
  await expect(pad.getByRole("button")).toHaveCount(10);
  await page.locator(cell(2)).click();
  await pad.getByRole("button", { name: /^4\b/ }).click();
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.getByRole("button", { name: "Erase" }).click();
  await expect(page.locator(cell(2))).toHaveText("");
});

test("does not change givens", async ({ page }) => {
  await page.locator(cell(0)).click();
  await page.keyboard.press("9");
  await expect(page.locator(cell(0))).toHaveText("5");
});

test("marks conflicts without relying on color", async ({ page }) => {
  // Cell 2 shares row 1 with the given 5 in cell 0.
  await page.locator(cell(2)).click();
  await page.keyboard.press("5");
  await expect(page.locator(cell(2))).toHaveClass(/cell--conflict/);
  await expect(page.locator(cell(2))).toHaveAttribute("aria-label", /conflict/);
});

test("assistance switch: Medium marks a wrong digit at once, Hard marks nothing, Easy adds Hint", async ({ page }) => {
  const level = (name: string) => page.getByRole("radiogroup", { name: "Assistance" }).getByRole("radio", { name });
  await expect(level("Medium")).toBeChecked();
  await expect(page.getByRole("button", { name: "Hint" })).toHaveCount(0);
  // r1c4 is 6 in the solution; 2 breaks no rule there, so only the wrong-digit mark can flag it.
  await page.locator(cell(3)).click();
  await page.keyboard.press("2");
  await expect(page.locator(cell(3))).toHaveClass(/cell--wrong/);
  await expect(page.locator(cell(3))).not.toHaveClass(/cell--conflict/);
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /wrong/);

  await level("Hard").check();
  await expect(page.locator(".cell--wrong")).toHaveCount(0);
  await page.locator(cell(2)).click();
  await page.keyboard.press("5"); // repeats the given 5 in row 1
  await expect(page.locator(".cell--conflict")).toHaveCount(0);
  await expect(page.locator(cell(2))).not.toHaveAttribute("aria-label", /conflict|wrong/);

  // Arrow keys move along the switch like any radio group, and the choice persists.
  await level("Hard").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(level("Medium")).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(level("Easy")).toBeChecked();
  await expect(page.getByRole("button", { name: "Hint" })).toBeVisible();
  await expect(page.locator(cell(2))).toHaveClass(/cell--conflict/);
  await page.reload();
  await expect(level("Easy")).toBeChecked();
});

test("has no horizontal scroll", async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`has no serious accessibility violations in ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("resumes board and timer after reload", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.locator("[data-cell]")).toHaveCount(81);
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.evaluate(() => {
    const w = window as unknown as { __sudoku: { advance(ms: number): void } };
    w.__sudoku.advance(60_000);
  });
  await page.keyboard.press("Backspace");
  await page.keyboard.press("4");
  await page.reload();
  await expect(page.locator(cell(2))).toHaveText("4");
  const log = await page.evaluate(() => {
    const w = window as unknown as {
      __sudoku: { store: { getSnapshot(): { record: { log: { type: string }[]; nodes: unknown[] } } } };
    };
    const r = w.__sudoku.store.getSnapshot().record;
    return { types: r.log.map((e) => e.type), nodes: r.nodes.length };
  });
  expect(log.nodes).toBe(3);
  // One start, and the reload closed the clock (hidden) then reopened it (visible).
  expect(log.types.filter((t) => t === "start")).toHaveLength(1);
  expect(log.types).toContain("hidden");
  expect(log.types.at(-1)).toBe("visible");
});

test("renders notes as a 3x3 grid with a labelled cell", async ({ page }) => {
  await page.goto("/?test=1");
  await page.evaluate(() => {
    const s = (window as unknown as { __sudoku: { store: { dispatch(c: unknown): void } } }).__sudoku.store;
    for (const digit of [1, 4, 9]) s.dispatch({ type: "note", cell: 2, digit, on: true });
  });
  const c = page.locator(cell(2));
  await expect(c).toHaveAttribute("aria-label", "Row 1, column 3, empty, notes 1 4 9");
  await expect(c.locator(".note")).toHaveCount(9);
  await expect(c.locator(".note")).toHaveText(["1", "", "", "4", "", "", "", "", "9"]);
  await expect(c).toHaveClass(/cell--noted/);
});

test("a single placement re-renders only the affected cells", async ({ page }) => {
  await page.goto("/?test=1");
  await page.locator(cell(2)).click();
  const total = async () =>
    (await page.evaluate(() => (window as unknown as { __sudoku: { cellCommits(): number[] } }).__sudoku.cellCommits())).reduce(
      (a, b) => a + b,
      0,
    );
  const before = await total();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  // The placed cell, cells sharing the digit, and conflicts; never the whole board.
  expect((await total()) - before).toBeLessThan(15);
});

test("highlights peers and same digits with non-color cues", async ({ page }) => {
  await page.locator(cell(0)).click();
  await expect(page.locator(".cell--related")).toHaveCount(20);
  await expect(page.locator(".cell--same").first()).toBeVisible();
  const shadow = await page.locator(".cell--same").first().evaluate((e) => getComputedStyle(e).boxShadow);
  expect(shadow).not.toBe("none");
  const image = await page.locator(".cell--related").first().evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(image).toContain("gradient");
});

test("pad keys name their remaining count and mark finished digits", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the pad shows on touch screens only");
  await page.goto("/?test=1");
  const pad = page.getByRole("group", { name: "Number pad" });
  const four = pad.locator(".pad-key").filter({ hasText: /^4/ });
  await expect(four).toHaveAccessibleName(/^4\s*,\s*\d+ remaining$/);
  // The count is spoken, not shown: only a finished digit gets a visible mark.
  await expect(four.locator(".pad-count [aria-hidden]")).toHaveCount(0);
  const remaining = async () => Number(/(\d+) remaining/.exec(await four.evaluate((e) => e.textContent ?? ""))?.[1]);
  const before = await remaining();
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect.poll(remaining).toBe(before - 1);
  // Finish digit 4 through the store, then check dimming, strike-through and the label.
  await page.evaluate(() => {
    const s = (window as unknown as { __sudoku: { store: { getSnapshot(): { board: number[] }; dispatch(c: unknown): void } } }).__sudoku.store;
    for (const [i, v] of s.getSnapshot().board.entries()) {
      if (v === 0) s.dispatch({ type: "place", cell: i, digit: 4, input: "pad" });
    }
  });
  await expect(four).toHaveClass(/pad-key--done/);
  await expect(four).toHaveAccessibleName(/^4\s*,\s*complete$/);
  expect(await four.evaluate((e) => getComputedStyle(e.querySelector(".pad-digit")!).textDecorationLine)).toContain("line-through");
  await four.focus();
  await expect(four).toBeFocused();
  const box = await four.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("notes: N key, Shift+digit, and peers cleared on place", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "notes are a keyboard feature; the touch layout has no notes control");
  const indicator = page.locator(".keys-hint");
  await page.locator(cell(2)).click();
  await page.keyboard.press("Shift+4");
  await expect(page.locator(cell(2))).toHaveText("4");
  await expect(page.locator(cell(2))).not.toHaveClass(/cell--conflict/);
  await page.keyboard.press("n");
  await expect(indicator).toHaveText(/Notes on/);
  await page.keyboard.press("6");
  await expect(page.locator(cell(2))).toContainText("6");
  await page.keyboard.press("n");
  await expect(indicator).not.toHaveText(/Notes on/);
  // Placing 4 in a peer cell removes it from cell 2's notes.
  await page.locator(cell(3)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).not.toContainText("4");
  await expect(page.locator(cell(2))).toContainText("6");
});

test("new game swaps in a different puzzle from the bank", async ({ page }) => {
  const givens = () =>
    page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")?.endsWith("given") ?? false));
  const before = await givens();
  await startNewGame(page);
  await expect.poll(givens).not.toEqual(before);
  await expect(page.getByRole("button", { name: "New game" })).toBeEnabled();
  // Game remounts on the swap; focus must not fall back to body.
  await expect(page.getByRole("button", { name: "New game" })).toBeFocused();
});

/**
 * Replaces the engine worker with one that answers `generate` only after the test releases it,
 * and empties the bank so the generator is what new game waits on. Returns release() and the
 * number of generate requests seen.
 */
async function stubSlowGenerator(page: Page) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let requests = 0;
  // Digits relabelled 1<->9 etc. keep the puzzle valid and unique but visibly different.
  const relabel = (grid: string) => grid.replace(/[1-9]/g, (d) => String(10 - Number(d)));
  const result = { puzzle: relabel(SAMPLE_EASY.puzzle), solution: relabel(SAMPLE_EASY.solution), score: 1, level: "easy" };
  // Not valid bank JSON, so the source falls back to generation without a failed request.
  await page.route("**/puzzles/*.json", (route) => route.fulfill({ json: [] }));
  await page.route("**/__generator-gate", async (route) => {
    requests++;
    await gate;
    await route.fulfill({ body: "ok" });
  });
  await page.route("**/engine.worker*.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `const result = ${JSON.stringify(result)};
onmessage = async (e) => {
  await fetch(self.location.origin + "/__generator-gate");
  postMessage({ id: e.data.id, ok: true, result });
};`,
    }),
  );
  return { release: open, requests: () => requests, result };
}

test("new game shows a pending state while the generator is slow", async ({ page }) => {
  const slow = await stubSlowGenerator(page);
  const newGame = page.getByRole("button", { name: "New game" });
  const status = page.locator(".new-game").getByRole("status");
  await expect(page.locator(cell(1))).toHaveAttribute("aria-label", "Row 1, column 2, 3, given");

  await startNewGame(page);
  await expect(status).toContainText("Generating");
  await expect(newGame).toBeDisabled();
  await expect(newGame).toHaveAttribute("aria-busy", "true");
  // Focus stays on the button (it is aria-disabled, not disabled), and the old game stays put.
  await expect(newGame).toBeFocused();
  await expect(page.locator(cell(1))).toHaveAttribute("aria-label", "Row 1, column 2, 3, given");
  const noWideScroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(noWideScroll).toBeLessThanOrEqual(0);

  // A second activation while pending must not start another generation.
  await newGame.click({ force: true });
  slow.release();
  await expect(page.locator(cell(1))).toHaveAttribute("aria-label", "Row 1, column 2, 7, given");
  await expect(page.getByRole("button", { name: "New game" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "New game" })).toBeFocused();
  await expect(page.locator(".new-game").getByRole("status")).toHaveText("");
  expect(slow.requests()).toBe(1);
});

test("new game asks before abandoning a game in progress", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Abandon this game?" });
  const newGame = page.getByRole("button", { name: "New game" });
  const keep = dialog.getByRole("button", { name: "Keep playing" });
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");

  // Escape cancels and hands focus back; the game is untouched.
  await startNewGame(page);
  await expect(dialog).toBeVisible();
  await expect(keep).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(newGame).toBeFocused();
  await expect(page.locator(cell(2))).toHaveText("4");

  // So does the Keep playing button.
  await startNewGame(page);
  await keep.click();
  await expect(dialog).toHaveCount(0);
  await expect(newGame).toBeFocused();
  await expect(page.locator(cell(2))).toHaveText("4");

  // Confirming by keyboard abandons the game for a different puzzle.
  const givens = () =>
    page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")?.endsWith("given") ?? false));
  const before = await givens();
  await startNewGame(page);
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Abandon and start new" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect.poll(givens).not.toEqual(before);
  await expect(page.locator(cell(2))).toHaveText("");
});

for (const theme of ["light", "dark"] as const) {
  test(`abandon dialog is accessible and fits in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.locator(cell(2)).click();
    await page.keyboard.press("4");
    await startNewGame(page);
    const dialog = page.getByRole("dialog", { name: "Abandon this game?" });
    await expect(dialog).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    for (const name of ["Keep playing", "Abandon and start new"]) {
      const b = (await dialog.getByRole("button", { name }).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("undo and redo shortcuts", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.keyboard.press("Control+z");
  await expect(page.locator(cell(2))).toHaveText("");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  await expect(page.locator(cell(2))).toHaveText("4");
});

test("new game dialog lists the five levels and cancels without changing the game", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Choose a difficulty" });
  const newGame = page.getByRole("button", { name: "New game" });
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await newGame.click();
  await expect(dialog.getByRole("radio")).toHaveCount(5);
  await expect(dialog.getByRole("radio", { name: "Easy" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "Easy" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("radio", { name: "Medium" })).toBeChecked();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(newGame).toBeFocused();
  await expect(page.locator(cell(2))).toHaveText("4");
  await newGame.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(cell(2))).toHaveText("4");
});

test("the Undo button tracks availability", async ({ page }) => {
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator(cell(2))).toHaveText("");
  await expect(undo).toBeDisabled();
});

test("the play screen offers only New game, theme, Undo, Check and the assistance switch", async ({ page }) => {
  for (const name of ["Share", "Import", "Shortcuts", "Stats", "Settings", "Display", "Redo", "Reset", "Pause", "Fill notes", "Submit"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  for (const name of ["New game", "Undo", "Check"]) await expect(page.getByRole("button", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Assistance" }).getByRole("radio")).toHaveCount(3);
});

test("Check reports on track or a count without digits, and marks wrong cells with a cue", async ({ page }) => {
  // Hard: nothing is marked until Check, so the marks below come from Check alone.
  await page.getByRole("radio", { name: "Hard" }).check();
  const status = page.getByRole("status").filter({ hasText: /track|error/ });
  const check = page.getByRole("button", { name: "Check", exact: true });
  await page.locator(cell(2)).click();
  await page.keyboard.press("4"); // correct
  await check.click();
  await expect(page.getByRole("status").filter({ hasText: "On track" })).toBeVisible();
  await page.locator(cell(3)).click();
  await page.keyboard.press("9"); // wrong
  await expect(page.getByText("On track")).toHaveCount(0);
  await expect(page.locator(cell(3))).not.toHaveClass(/cell--wrong/);
  await check.click();
  await expect(status).toHaveText("1 error");
  await expect(page.locator(cell(3))).toHaveClass(/cell--wrong/);
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /wrong/);
  await expect(page.locator(cell(2))).not.toHaveClass(/cell--wrong/);
  // The result never gives away the right digit (6) for the wrong cell.
  await expect(page.locator(".check-status")).not.toContainText("6");
  await expect(page.locator(".toolbar")).not.toContainText("6");

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  // Editing makes the result stale.
  await page.keyboard.press("6");
  await expect(page.locator(cell(3))).not.toHaveClass(/cell--wrong/);
});
