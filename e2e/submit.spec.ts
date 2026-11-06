import AxeBuilder from "@axe-core/playwright";
import { SAMPLE_EASY } from "../src/engine/samples";
import { expect, test } from "./fixtures";

const blanks = [...SAMPLE_EASY.puzzle].flatMap((c, i) => (c === "." ? [i] : []));

test.beforeEach(async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`solving opens an accessible result with the solve time, and locks the board (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await solveAll(page);
    const result = page.getByRole("dialog", { name: /Solved/ });
    await expect(result).toBeVisible();
    await expect(result).toContainText(/Solved in \d+:\d\d/);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(result).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Check/ })).toBeDisabled();
  });
}

for (const motion of ["no-preference", "reduce"] as const) {
  test(`solving plays the completion animation only without reduced motion (${motion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await solveAll(page);
    const cell = page.locator(".board-row > [role=gridcell]").first();
    await expect(page.locator(".board")).toHaveAttribute("data-solved", "");
    const name = await cell.evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe(motion === "reduce" ? "none" : "board-solved");
  });
}

async function solveAll(page: import("@playwright/test").Page) {
  await page.evaluate(
    ({ blanks, solution }) => {
      const store = (window as unknown as { __sudoku: { store: { dispatch(c: unknown): void } } }).__sudoku.store;
      for (const cell of blanks) store.dispatch({ type: "place", cell, digit: Number(solution[cell]), input: "keyboard" });
    },
    { blanks, solution: SAMPLE_EASY.solution },
  );
}

test("filling the last cell correctly submits automatically", async ({ page }) => {
  await page.evaluate(
    ({ blanks, solution }) => {
      const store = (window as unknown as { __sudoku: { store: { dispatch(c: unknown): void } } }).__sudoku.store;
      for (const cell of blanks.slice(0, -1))
        store.dispatch({ type: "place", cell, digit: Number(solution[cell]), input: "keyboard" });
    },
    { blanks, solution: SAMPLE_EASY.solution },
  );
  const last = blanks[blanks.length - 1]!;
  await page.locator(`[data-cell="${last}"]`).click();
  await page.keyboard.press(SAMPLE_EASY.solution[last]!);
  await expect(page.getByRole("dialog", { name: /Solved/ })).toBeVisible();
});

test("New game in the solved result dialog opens the difficulty picker", async ({ page }) => {
  await solveAll(page);
  const result = page.getByRole("dialog", { name: /Solved/ });
  await result.getByRole("button", { name: "New game" }).click();
  await expect(page.getByRole("dialog", { name: "Choose a difficulty" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "New game" })).toBeFocused();
});
