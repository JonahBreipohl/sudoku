import { expect, test } from "./fixtures";

test("daily puzzle starts from the New game dialog and shows a badge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("button", { name: /Daily puzzle/ }).click();
  await expect(page.locator(".daily-badge")).toBeVisible();
});

test("a solved daily is not offered again", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("button", { name: /Daily puzzle/ }).click();
  await expect(page.locator(".daily-badge")).toBeVisible();
  await page.evaluate(() => {
    const store = (window as unknown as { __sudoku: { store: { getSnapshot(): { record: { puzzle: string; solution: string } }; dispatch(c: unknown): void } } }).__sudoku.store;
    const { puzzle, solution } = store.getSnapshot().record;
    for (let i = 0; i < 81; i++)
      if (puzzle[i] === "." || puzzle[i] === "0") store.dispatch({ type: "place", cell: i, digit: Number(solution[i]), input: "keyboard" });
  });
  const result = page.getByRole("dialog", { name: /Solved/ });
  await expect(result).toBeVisible();
  await result.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "New game" }).click();
  const solved = page.locator("[data-daily-solved]");
  await expect(solved).toContainText("solved today");
  await expect(solved).toHaveAttribute("aria-disabled", "true");
  await solved.click({ force: true });
  await expect(page.getByRole("dialog", { name: "Choose a difficulty" })).toBeVisible();
});
