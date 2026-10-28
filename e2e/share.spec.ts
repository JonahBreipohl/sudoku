import { expect, test } from "./fixtures";

const PUZZLE = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

test("share shows the puzzle, and import rejects bad input then starts a good one", async ({ page }) => {
  await page.goto("/?test=1");
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this puzzle" });
  await expect(dialog.getByLabel("Puzzle string")).toHaveValue(/^[1-9.]{81}$/);
  await expect(dialog.getByLabel("Link")).toHaveValue(/\?puzzle=[1-9.]{81}$/);
  // Headless Chromium denies the clipboard, so this exercises the fallback path as well.
  await dialog.getByRole("button", { name: /Copy puzzle string/ }).click();
  await expect(dialog.getByRole("status")).not.toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Import" }).click();
  const imp = page.getByRole("dialog", { name: "Import a puzzle" });
  await expect(imp.getByLabel("Puzzle string or link")).toBeFocused();
  await imp.getByLabel("Puzzle string or link").fill("12345");
  await imp.getByRole("button", { name: "Import" }).click();
  await expect(imp.getByRole("alert")).toContainText("exactly 81 cells");

  await imp.getByLabel("Puzzle string or link").fill(`http://localhost/?puzzle=${PUZZLE}`);
  await imp.getByRole("button", { name: "Import" }).click();
  await expect(imp).toBeHidden();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});
