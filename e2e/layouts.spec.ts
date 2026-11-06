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

for (const [w, h] of [
  [375, 667],
  [360, 740],
] as const) {
  test.describe(`small phone ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true });

    for (const scheme of ["light", "dark"] as const) {
      test(`fits without scrolling, with a one-row header and a home link (${scheme})`, async ({ page }) => {
        await open(page, scheme);
        const fits = await page.evaluate(() => {
          const el = document.querySelector(".app")!;
          return {
            v: el.scrollHeight <= el.clientHeight && document.documentElement.scrollHeight <= window.innerHeight,
            h: el.scrollWidth <= el.clientWidth,
          };
        });
        expect(fits).toEqual({ v: true, h: true });
        expect(await noHScroll(page)).toBe(true);
        const board = await box(page, ".board");
        const pad = await box(page, ".pad");
        expect(board.y).toBeGreaterThanOrEqual(0);
        expect(pad.y + pad.height).toBeLessThanOrEqual(h);
        // One header row: every header control shares a vertical band.
        const rows = await page.locator(".app-header > *:visible").evaluateAll((els) =>
          new Set(els.map((e) => Math.round(e.getBoundingClientRect().top / 10))).size,
        );
        expect(rows).toBeLessThanOrEqual(2);
        expect((await box(page, ".app-header")).height).toBeLessThanOrEqual(64);

        const home = page.locator(".app-header").getByRole("link", { name: "Jonah Breipohl" });
        await expect(home).toHaveAttribute("href", "https://jonahbreipohl.com/");
        const target = (await home.boundingBox())!;
        expect(target.height).toBeGreaterThanOrEqual(44);
        expect(target.width).toBeGreaterThanOrEqual(44);
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  });
}

for (const [w, h] of [
  [1440, 900],
  [1024, 768],
] as const) {
  test(`home link in header at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, "light");
    const link = page.locator(".app-header").getByRole("link", { name: "Jonah Breipohl" });
    await expect(link).toBeVisible();
    await expect(link).toContainText("Jonah Breipohl");
    await expect(link).toHaveAttribute("href", "https://jonahbreipohl.com/");
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await link.focus();
    await expect(link).toBeFocused();
  });
}
