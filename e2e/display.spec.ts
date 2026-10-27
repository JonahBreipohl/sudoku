import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

for (const scheme of ["light", "dark"] as const) {
  test(`display mode clock, layout, exit (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?mode=display");
    const time = page.locator(".display-time");
    await expect(time).toBeVisible();
    await expect(page.locator(".display-date")).toBeVisible();
    const first = await time.textContent();
    await expect.poll(() => time.textContent(), { timeout: 3000 }).not.toBe(first);
    const vp = page.viewportSize()!;
    const box = (await time.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const exit = page.getByRole("button", { name: "Exit Display" });
    await expect(exit).toBeFocused();
    expect((await exit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
    expect(page.url()).not.toContain("mode=display");
  });
}

test("toggle in Play enters Display and the button exits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await expect(page.locator(".display-time")).toBeVisible();
  await page.getByRole("button", { name: "Exit Display" }).click();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});
