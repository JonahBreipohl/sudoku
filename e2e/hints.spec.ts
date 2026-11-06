import type { Page } from "@playwright/test";
import { SAMPLE_EASY } from "../src/engine/samples";
import { expect, presetSettings, test } from "./fixtures";

const puzzle = SAMPLE_EASY.puzzle.replace(/\./g, "0");
const blanks = [...puzzle].flatMap((c, i) => (c === "0" ? [i] : []));
const right = (cell: number) => Number(SAMPLE_EASY.solution[cell]);

/** Hints are an Easy feature. */
async function open(page: Page) {
  await presetSettings(page, { assist: "easy" });
  await page.goto(`/?test=1&puzzle=${puzzle}&level=easy`);
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
}

const panel = (page: Page) => page.getByRole("group", { name: "Hint" });

test("three presses escalate and the reveal applies the right digit", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toHaveAttribute("data-tier", "nudge");
  await expect(page.locator(".cell--mark-hint, .cell--mark-hint-unit").first()).toBeVisible();
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toHaveAttribute("data-tier", "technique");
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toHaveAttribute("data-tier", "reveal");
  const target = page.locator(".cell--mark-hint").first();
  const cell = Number(await target.getAttribute("data-cell"));
  await page.getByRole("button", { name: "Fill it in" }).click();
  await expect(page.locator(`[data-cell="${cell}"]`)).toHaveText(String(right(cell)));
  // The board changed, so escalation starts over.
  await expect(panel(page)).toHaveCount(0);
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toHaveAttribute("data-tier", "nudge");
});

test("a planted mistake is hinted first and announced", async ({ page }) => {
  await open(page);
  const bad = blanks[5]!;
  await page.locator(`[data-cell="${bad}"]`).click();
  await page.keyboard.press(String((right(bad) % 9) + 1));
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(panel(page)).toHaveAttribute("data-tier", "nudge");
  await expect(page.locator(`[data-cell="${bad}"]`)).toHaveClass(/cell--mark-hint/);
  await expect(page.locator("[aria-live=polite]")).not.toHaveText("");
});

test("leaving Easy hides the Hint button and any hint on screen", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await page.getByRole("radio", { name: "Medium" }).check();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator(".cell--mark-hint, .cell--mark-hint-unit")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hint", exact: true })).toHaveCount(0);
  // Shift+H does nothing outside Easy.
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toHaveCount(0);
});

test("the button names the next step, the panel counts the hints, and the hinted cell is selected", async ({ page }) => {
  await open(page);
  const button = page.getByRole("button", { name: /^(Hint|More help|Show answer)$/ });
  await expect(button).toHaveText(/Hint$/);
  await button.click();
  await expect(panel(page)).toContainText("Hint 1 of 3");
  await expect(button).toHaveText(/More help$/);
  // The sample's first step is a single cell, so it is selected and can be typed into directly.
  const hinted = page.locator(".cell--mark-hint").first();
  await expect(hinted).toHaveClass(/cell--selected/);
  // Plain words for players, not the r5c5 shorthand.
  await expect(panel(page)).toContainText(/row \d, column \d/);
  await expect(panel(page)).not.toContainText(/\br\dc\d\b/);

  await button.click();
  await expect(panel(page)).toContainText("Hint 2 of 3");
  // The technique tier says what the technique means, not just its name.
  await expect(panel(page)).toContainText(/Single in .+\. \w+/);
  await expect(button).toHaveText(/Show answer$/);
  await button.click();
  await expect(panel(page)).toContainText("Hint 3 of 3");
  await expect(button).toBeDisabled();
  await expect(panel(page).getByRole("button", { name: "Fill it in" })).toBeVisible();
});

test("a hint closes with its button or Escape, and the next press starts over", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toHaveAttribute("data-tier", "nudge");
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toHaveAttribute("data-tier", "technique");
  await panel(page).getByRole("button", { name: "Close hint" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator(".cell--mark-hint, .cell--mark-hint-unit")).toHaveCount(0);
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toHaveAttribute("data-tier", "nudge");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
});

test("the solved dialog reports how many hints were used", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Shift+H");
  await expect(panel(page)).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(
    ({ blanks, solution }) => {
      const store = (window as unknown as { __sudoku: { store: { dispatch(c: unknown): void } } }).__sudoku.store;
      for (const cell of blanks) store.dispatch({ type: "place", cell, digit: Number(solution[cell]), input: "keyboard" });
    },
    { blanks, solution: SAMPLE_EASY.solution },
  );
  await expect(page.getByRole("dialog", { name: /Solved/ })).toContainText(/Solved in \d+:\d\d with 1 hint\./);
});
