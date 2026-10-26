import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { activeMs } from "../src/state/timer";
import type { MetaEvent } from "../src/state/events";
import { expect, test } from "./fixtures";

const cell = (n: number) => `[data-cell="${n}"]`;

type Hook = { advance(ms: number): void; store: { getSnapshot(): { record: { log: MetaEvent[] } } } };
const advance = (page: Page, ms: number) =>
  page.evaluate((n) => (window as unknown as { __sudoku: Hook }).__sudoku.advance(n), ms);
const logOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sudoku: Hook }).__sudoku.store.getSnapshot().record.log);

test.beforeEach(async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

test("pause removes the grid from the DOM and the controls, and resume brings the board back", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await page.getByRole("button", { name: /Pause/ }).click();
  const region = page.getByRole("region", { name: "Game paused" });
  await expect(region).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.locator("[data-cell]")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Game controls" })).toHaveCount(0);
  // Board contents must not leak into the page text.
  await expect(page.locator("body")).not.toContainText("Row 1, column 3");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(cell(2))).toHaveText("4");
});

test("the paused minute does not count toward the timer", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await advance(page, 30_000);
  await page.getByRole("button", { name: /Pause/ }).click();
  await expect(page.getByRole("region", { name: "Game paused" })).toBeVisible();
  await advance(page, 600_000);
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(cell(2))).toBeFocused();
  await advance(page, 30_000);
  await page.keyboard.press("Backspace");

  const log = await logOf(page);
  const last = log.at(-1)!.at;
  const active = activeMs({ log }, last + 30_000);
  // 30s + 30s of play, give or take the real time the test itself took.
  expect(active).toBeGreaterThanOrEqual(60_000);
  expect(active).toBeLessThan(75_000);
});

test("reload resumes board, notes and the elapsed time", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await page.locator(cell(3)).click();
  await page.keyboard.press("Shift+6");
  await page.keyboard.press("Shift+8");
  await advance(page, 90_000);
  await page.keyboard.press("Shift+9");
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /notes 6 8 9/);
  const before = await logOf(page);

  await page.reload();
  await expect(page.locator(cell(2))).toHaveText("4");
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", "Row 1, column 4, empty, notes 6 8 9");
  await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();

  const after = await logOf(page);
  expect(after.filter((e) => e.type === "start")).toHaveLength(1);
  const lastBefore = before.at(-1)!.at;
  // Time already played survives the reload (clock offset resets, so read at the pre-reload stamp).
  const hiddenAt = after.find((e) => e.type === "hidden")!.at;
  expect(activeMs({ log: after.filter((e) => e.at <= hiddenAt) }, hiddenAt)).toBeGreaterThanOrEqual(90_000);
  expect(hiddenAt).toBeGreaterThanOrEqual(lastBefore);
});

test("a game paused before reload is still paused after it", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await page.getByRole("button", { name: /Pause/ }).click();
  await expect(page.getByRole("region", { name: "Game paused" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Game paused" })).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator(cell(2))).toHaveText("4");
});

for (const theme of ["light", "dark"] as const) {
  test(`paused screen is accessible in ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.getByRole("button", { name: /Pause/ }).click();
    await expect(page.getByRole("region", { name: "Game paused" })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
