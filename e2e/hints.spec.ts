import type { Page } from "@playwright/test";
import { SAMPLE_EASY } from "../src/engine/samples";
import { expect, test } from "./fixtures";

const puzzle = SAMPLE_EASY.puzzle.replace(/\./g, "0");
const blanks = [...puzzle].flatMap((c, i) => (c === "0" ? [i] : []));
const right = (cell: number) => Number(SAMPLE_EASY.solution[cell]);

async function open(page: Page) {
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
  await page.getByRole("button", { name: "Apply" }).click();
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
