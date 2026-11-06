import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const cell = (n: number) => `[data-cell="${n}"]`;

test.beforeEach(async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

async function expectNoSeriousViolations(page: Page) {
  // Scan the settled screen: axe counts opacity, so a fade-in still running (the paused screen's
  // 160 ms mode-fade) can read as low contrast.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`axe: every screen and dialog has no serious violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await expectNoSeriousViolations(page);

    await page.getByRole("button", { name: "New game" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoSeriousViolations(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    for (const level of ["Easy", "Hard"]) {
      await page.getByRole("radio", { name: level }).check();
      await expectNoSeriousViolations(page);
    }

    // No Pause button any more, but a game saved while paused still opens on the paused screen.
    await page.evaluate(() =>
      (window as unknown as { __sudoku: { store: { dispatch(c: unknown): void } } }).__sudoku.store.dispatch({ type: "pause" }),
    );
    await expect(page.getByRole("region", { name: "Game paused" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
}

test("grid uses roving tabindex and cell labels carry state", async ({ page }) => {
  await expect(page.locator('.board [tabindex="0"]')).toHaveCount(1);
  await page.locator(cell(2)).click();
  await expect(page.locator('.board [tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(cell(3))).toBeFocused();
  await expect(page.locator(cell(3))).toHaveAttribute("tabindex", "0");
  await expect(page.locator(cell(0))).toHaveAttribute("aria-label", /given/);
});

test("live region announces placements, conflicts and check results", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/Placed 4 at row 1, column 3/);
  // cell 0 is a given 5 in the same row, so another 5 conflicts.
  await page.locator(cell(3)).click();
  await page.keyboard.press("5");
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/Conflict/);
  await page.getByRole("button", { name: /Check/ }).click();
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/^Check:/);
});

test("dialogs restore focus to the opener", async ({ page }) => {
  const opener = page.getByRole("button", { name: "New game" });
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

test("reduced motion removes transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const ms = await page.evaluate(() => {
    const all = [...document.querySelectorAll("*")];
    return Math.max(...all.map((e) => parseFloat(getComputedStyle(e).transitionDuration) || 0));
  });
  expect(ms).toBeLessThan(0.01);
});
