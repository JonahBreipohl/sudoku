import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function open(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
}

const noHScroll = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth,
  );

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test.describe("phone portrait 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const scheme of ["light", "dark"] as const) {
    test(`grid fills width, pad and controls in bottom third (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      const board = await box(page, ".board");
      expect(board.width).toBeGreaterThanOrEqual(390 - 2 * 16 - 1);
      const controls = await box(page, ".controls");
      const pad = await box(page, ".pad");
      expect(controls.y).toBeGreaterThanOrEqual((844 * 2) / 3);
      expect(pad.y + pad.height).toBeLessThanOrEqual(844);
      expect(await noHScroll(page)).toBe(true);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("phone landscape 844x390", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

  for (const scheme of ["light", "dark"] as const) {
    test(`grid and pad side by side without scrolling (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      const board = await box(page, ".board");
      const pad = await box(page, ".pad");
      expect(pad.x).toBeGreaterThanOrEqual(board.x + board.width);
      expect(board.y + board.height).toBeLessThanOrEqual(390);
      expect(pad.y + pad.height).toBeLessThanOrEqual(390);
      const scroll = await page.evaluate(() => {
        const app = document.querySelector(".app")!;
        return {
          page: document.documentElement.scrollHeight <= window.innerHeight,
          app: app.scrollHeight <= app.clientHeight,
        };
      });
      expect(scroll).toEqual({ page: true, app: true });
      expect(await noHScroll(page)).toBe(true);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("narrow 320px", () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true });

  for (const scheme of ["light", "dark"] as const) {
    test(`never scrolls horizontally (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      expect(await noHScroll(page)).toBe(true);
      const appScroll = await page.evaluate(() => {
        const app = document.querySelector(".app")!;
        return app.scrollWidth <= app.clientWidth;
      });
      expect(appScroll).toBe(true);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
