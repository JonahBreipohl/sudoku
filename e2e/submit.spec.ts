import AxeBuilder from "@axe-core/playwright";
import { SAMPLE_EASY } from "../src/engine/samples";
import { expect, test } from "./fixtures";

const blanks = [...SAMPLE_EASY.puzzle].flatMap((c, i) => (c === "." ? [i] : []));

test.beforeEach(async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`result dialog is accessible, closes to a focused View result button and reopens (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.getByRole("button", { name: /Submit/ }).click();
    await page.getByRole("dialog", { name: "Submit this puzzle?" }).getByRole("button", { name: "Submit" }).click();
    const result = page.getByRole("dialog", { name: /Not solved yet/ });
    await expect(result).toContainText(`${blanks.length} empty cells`);
    await expect(result.getByRole("button", { name: /Analyze mistakes/ })).toBeEnabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(result).toHaveCount(0);
    const view = page.getByRole("button", { name: /View result/ });
    await expect(view).toBeFocused();
    await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();
    await page.keyboard.press("Enter");
    await expect(result).toBeVisible();
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

for (const theme of ["light", "dark"] as const) {
  test(`analysis marks the root mistake and passes axe (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const cell = blanks[0]!;
    const wrong = (Number(SAMPLE_EASY.solution[cell]) % 9) + 1;
    await page.locator(`[data-cell="${cell}"]`).click();
    await page.keyboard.press(String(wrong));
    await page.getByRole("button", { name: /Submit/ }).click();
    await page.getByRole("dialog", { name: "Submit this puzzle?" }).getByRole("button", { name: "Submit" }).click();
    await page.getByRole("dialog", { name: /Not solved yet/ }).getByRole("button", { name: /Analyze mistakes/ }).click();
    const panel = page.getByRole("region", { name: "Analysis" });
    await expect(panel).toContainText("First mistake");
    await expect(panel).toBeFocused();
    await expect(page.locator(`[data-cell="${cell}"]`)).toHaveClass(/cell--mark-root/);
    await expect(page.locator(`[data-cell="${cell}"]`)).toHaveAttribute("aria-label", /mistake/);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await panel.getByRole("button", { name: "Close analysis" }).click();
    await expect(panel).toHaveCount(0);
  });
}

test("timeline previews earlier moves read-only and returns to now", async ({ page }) => {
  const [a, b] = [blanks[0]!, blanks[1]!];
  for (const cell of [a, b]) {
    await page.locator(`[data-cell="${cell}"]`).click();
    await page.keyboard.press(String(((Number(SAMPLE_EASY.solution[cell]) + (cell === a ? 0 : 1)) % 9) + 1));
  }
  await page.getByRole("button", { name: /Submit/ }).click();
  await page.getByRole("dialog", { name: "Submit this puzzle?" }).getByRole("button", { name: "Submit" }).click();
  await page.getByRole("dialog", { name: /Not solved yet/ }).getByRole("button", { name: /Analyze mistakes/ }).click();
  const panel = page.getByRole("region", { name: "Analysis" });
  const label = panel.getByTestId("timeline-label");
  await expect(label).toContainText("Move 2 of 2");
  await panel.getByRole("button", { name: "Jump to mistake" }).click();
  await expect(label).toContainText("Move 1 of 2");
  await expect(page.getByRole("grid", { name: /preview/ })).toBeVisible();
  await expect(page.locator(`[data-cell="${b}"]`)).toHaveAttribute("aria-label", /empty/);
  const slider = panel.getByRole("slider", { name: "Move" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(label).toContainText("Move 2 of 2");
  await expect(panel.getByRole("button", { name: "Back to now" })).toBeDisabled();
  await page.keyboard.press("Home");
  await expect(label).toContainText("Starting position");
  await panel.getByRole("button", { name: "Back to now" }).click();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

test("rewinding before the mistake reopens play on a new branch", async ({ page }) => {
  const [a, b] = [blanks[0]!, blanks[1]!];
  const right = (c: number) => String(SAMPLE_EASY.solution[c]);
  const wrong = (c: number) => String((Number(SAMPLE_EASY.solution[c]) % 9) + 1);
  await page.locator(`[data-cell="${a}"]`).click();
  await page.keyboard.press(right(a));
  await page.locator(`[data-cell="${b}"]`).click();
  await page.keyboard.press(wrong(b));
  await page.getByRole("button", { name: /Submit/ }).click();
  await page.getByRole("dialog", { name: "Submit this puzzle?" }).getByRole("button", { name: "Submit" }).click();
  await page.getByRole("dialog", { name: /Not solved yet/ }).getByRole("button", { name: /Analyze mistakes/ }).click();
  const panel = page.getByRole("region", { name: "Analysis" });
  await panel.getByTestId("rewind-before-mistake").click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Submit/ })).toBeEnabled();
  await expect(page.locator(`[data-cell="${b}"]`)).toHaveAttribute("aria-label", /empty/);
  await page.locator(`[data-cell="${b}"]`).click();
  await page.keyboard.press(right(b));
  await expect(page.getByTestId("branch-point")).toHaveCount(1);
});

test("New game in the solved result dialog opens the difficulty picker", async ({ page }) => {
  await solveAll(page);
  const result = page.getByRole("dialog", { name: /Solved/ });
  await result.getByRole("button", { name: "New game" }).click();
  await expect(page.getByRole("dialog", { name: "Choose a difficulty" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "New game" })).toBeFocused();
});
