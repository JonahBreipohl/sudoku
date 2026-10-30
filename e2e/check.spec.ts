import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { SAMPLE_EASY } from "../src/engine/samples";
import { expect, test } from "./fixtures";

const puzzle = SAMPLE_EASY.puzzle.replace(/\./g, "0");
const blanks = [...puzzle].flatMap((c, i) => (c === "0" ? [i] : []));
const right = (cell: number) => Number(SAMPLE_EASY.solution[cell]);
const wrongDigit = (cell: number) => (right(cell) % 9) + 1;

async function open(page: Page) {
  await page.goto(`/?test=1&puzzle=${puzzle}&level=easy`);
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
}

async function enter(page: Page, cell: number, digit: number) {
  await page.locator(`[data-cell="${cell}"]`).click();
  await page.keyboard.press(String(digit));
}

const noAxeViolations = async (page: Page) =>
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

const checkButton = (page: Page) => page.getByRole("button", { name: /Check/ });

test("Check with only correct entries says on track and marks nothing", async ({ page }) => {
  await open(page);
  await enter(page, blanks[0]!, right(blanks[0]!));
  await enter(page, blanks[1]!, right(blanks[1]!));
  await checkButton(page).click();
  await expect(page.locator(".check-status")).toHaveText("On track");
  await expect(page.locator(".cell--wrong")).toHaveCount(0);
  await noAxeViolations(page);
});

test("Check with a wrong entry reports the count and marks only that cell, never the digit", async ({ page }) => {
  await open(page);
  const bad = blanks[2]!;
  await enter(page, blanks[0]!, right(blanks[0]!));
  await enter(page, bad, wrongDigit(bad));
  await checkButton(page).click();
  await expect(page.locator(".check-status")).toHaveText("1 error");
  await expect(page.locator(".cell--wrong")).toHaveCount(1);
  await expect(page.locator(`[data-cell="${bad}"]`)).toHaveAttribute("aria-label", /, wrong/);
  await expect(page.locator(`[data-cell="${blanks[0]!}"]`)).not.toHaveAttribute("aria-label", /wrong/);
  await expect(page.locator(".check-status")).not.toContainText(String(right(bad)));
  await noAxeViolations(page);
});

test("two wrong entries are counted, and an edit makes the result stale", async ({ page }) => {
  await open(page);
  const [a, b] = [blanks[3]!, blanks[4]!];
  await enter(page, a, wrongDigit(a));
  await enter(page, b, wrongDigit(b));
  await checkButton(page).click();
  await expect(page.locator(".check-status")).toHaveText("2 errors");
  await expect(page.locator(".cell--wrong")).toHaveCount(2);
  await enter(page, a, right(a));
  await expect(page.locator(".check-status")).toHaveText("");
  await expect(page.locator(".cell--wrong")).toHaveCount(0);
  await checkButton(page).click();
  await expect(page.locator(".check-status")).toHaveText("1 error");
  await expect(page.locator(".cell--wrong")).toHaveCount(1);
});

test("Check is operable from the keyboard with visible focus", async ({ page }) => {
  await open(page);
  const bad = blanks[5]!;
  await enter(page, bad, wrongDigit(bad));
  const button = checkButton(page);
  await button.focus();
  await expect(button).toBeFocused();
  const outline = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
  });
  expect(outline.style !== "none" && outline.width > 0 ? true : outline.shadow !== "none").toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.locator(".check-status")).toHaveText("1 error");
  await page.keyboard.press("Space");
  await expect(page.locator(".check-status")).toHaveText("1 error");
  await expect(button).toBeFocused();
  await noAxeViolations(page);
});

test("completing a row sweeps it once and announces it", async ({ page }) => {
  await open(page);
  const row = Math.floor(blanks[0]! / 9);
  const inRow = blanks.filter((b) => Math.floor(b / 9) === row);
  for (const cell of inRow) await enter(page, cell, right(cell));
  await expect(page.locator('[role="gridcell"][data-sweep]').first()).toBeAttached();
  await expect(page.locator('[aria-live="polite"]')).toContainText(`Row ${row + 1} complete`);
  // Gone again shortly after, so it never replays on its own.
  await expect(page.locator('[role="gridcell"][data-sweep]')).toHaveCount(0, { timeout: 3000 });
});
