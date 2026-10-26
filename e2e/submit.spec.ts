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
    await expect(result.getByRole("button", { name: /Analyze mistakes/ })).toBeDisabled();
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
