import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test, clickHeaderAction } from "./fixtures";

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

async function enableLeftHanded(page: Page) {
  await clickHeaderAction(page, "Settings");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("checkbox", { name: /Left-handed layout/ }).check();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

const sizes = [
  { name: "phone landscape", width: 844, height: 390 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const size of sizes) {
  test.describe(`left-handed ${size.name} ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    for (const scheme of ["light", "dark"] as const) {
      test(`pad and panel mirror to the left and persist (${scheme})`, async ({ page }) => {
        await open(page, scheme);
        let board = await box(page, ".board");
        let pad = await box(page, ".pad");
        expect(pad.x).toBeGreaterThanOrEqual(board.x + board.width);
        await enableLeftHanded(page);
        board = await box(page, ".board");
        pad = await box(page, ".pad");
        expect(pad.x + pad.width).toBeLessThanOrEqual(board.x);
        expect(await noHScroll(page)).toBe(true);
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
        await page.reload();
        await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
        expect((await box(page, ".pad")).x).toBeLessThan((await box(page, ".board")).x);
      });
    }
  });
}

test.describe("left-handed portrait 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("layout is unchanged", async ({ page }) => {
    await open(page, "light");
    const before = [await box(page, ".board"), await box(page, ".pad"), await box(page, ".controls")];
    await enableLeftHanded(page);
    const after = [await box(page, ".board"), await box(page, ".pad"), await box(page, ".controls")];
    expect(after).toEqual(before);
  });
});

for (const [w, h] of [
  [375, 667],
  [360, 740],
] as const) {
  test.describe(`small phone ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true });

    for (const scheme of ["light", "dark"] as const) {
      test(`fits without scrolling, More menu works (${scheme})`, async ({ page }) => {
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

        const more = page.getByRole("button", { name: /^More/ });
        await expect(more).toHaveAttribute("aria-expanded", "false");
        await more.click();
        await expect(more).toHaveAttribute("aria-expanded", "true");
        for (const name of ["Share", "Import", "Shortcuts", "Stats", "Settings"]) {
          const b = await page.getByRole("menu").or(page.locator("#more-menu")).getByRole("button", { name }).boundingBox();
          expect(b!.height).toBeGreaterThanOrEqual(44);
        }
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
        await page.keyboard.press("Escape");
        await expect(more).toHaveAttribute("aria-expanded", "false");
        await expect(more).toBeFocused();

        await more.click();
        await page.mouse.click(w / 2, h - 5);
        await expect(more).toHaveAttribute("aria-expanded", "false");

        await more.click();
        await page.locator("#more-menu").getByRole("button", { name: "Settings" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
      });
    }
  });
}
