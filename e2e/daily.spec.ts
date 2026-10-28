import { expect, test } from "./fixtures";

test("daily puzzle starts from the New game dialog and shows a badge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("button", { name: /Daily puzzle/ }).click();
  await expect(page.locator(".daily-badge")).toBeVisible();
});
