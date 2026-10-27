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

for (const size of [{ width: 1280, height: 720 }, { width: 3840, height: 2160 }, { width: 1080, height: 1920 }]) {
  test(`display board fits and is read only at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/?mode=display");
    const board = page.getByRole("grid", { name: "Current game, read only" });
    await expect(board).toBeVisible();
    await expect(board.getByRole("gridcell")).toHaveCount(81);
    await expect(board.locator("button")).toHaveCount(0);
    const b = (await board.boundingBox())!;
    const t = (await page.locator(".display-time").boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(size.width);
    expect(b.y + b.height).toBeLessThanOrEqual(size.height);
    expect(b.width).toBeGreaterThan(size.height * 0.4);
    const overlap = b.x < t.x + t.width && t.x < b.x + b.width && b.y < t.y + t.height && t.y < b.y + b.height;
    expect(overlap).toBe(false);
    const stats = page.getByRole("region", { name: "Today's stats" });
    await expect(stats).toContainText("Solved today");
    await expect(stats).toContainText("Streak");
    const s = (await stats.boundingBox())!;
    expect(s.y + s.height).toBeLessThanOrEqual(size.height);
    expect(s.x + s.width).toBeLessThanOrEqual(size.width);
    expect(b.y < s.y + s.height && s.y < b.y + b.height && b.x < s.x + s.width && s.x < b.x + b.width).toBe(false);
  });
}
