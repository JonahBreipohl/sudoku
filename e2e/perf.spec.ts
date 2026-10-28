import { test, expect } from "./fixtures";

// Local-preview time to interactive: navigation start until the first board cell is visible and enabled.
test("board is interactive within 2 s", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "budget is defined for the 390x844 project");
  await page.goto("/");
  const cell = page.getByRole("gridcell").first();
  await expect(cell).toBeVisible();
  await cell.click();
  const ms = await page.evaluate(() => performance.now());
  info.annotations.push({ type: "tti_ms", description: String(Math.round(ms)) });
  expect(ms).toBeLessThan(2000);
});
