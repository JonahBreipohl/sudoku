import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const cell = (n: number) => `[data-cell="${n}"]`;

const sizes = [
  { name: "phone portrait", width: 390, height: 844, touch: true },
  { name: "phone landscape", width: 844, height: 390, touch: true },
  { name: "tablet portrait", width: 820, height: 1180, touch: true },
  { name: "desktop", width: 1440, height: 900, touch: false },
] as const;

async function open(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
}

for (const size of sizes) {
  test.describe(`${size.name} ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch });

    for (const scheme of ["light", "dark"] as const) {
      test(`no horizontal scroll, key regions visible, axe clean (${scheme})`, async ({ page }) => {
        await open(page, scheme);

        const overflow = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth - window.innerWidth,
          body: document.body.scrollWidth - window.innerWidth,
        }));
        expect(overflow.doc).toBeLessThanOrEqual(0);
        expect(overflow.body).toBeLessThanOrEqual(0);

        const regions = [
          page.getByRole("grid", { name: "Sudoku board" }),
          page.getByRole("group", { name: /^Number pad/ }),
          page.getByRole("button", { name: /Undo/ }),
          page.getByRole("button", { name: /Pause/ }),
          page.getByRole("button", { name: "Settings", exact: true }),
        ];
        for (const region of regions) {
          await expect(region).toBeVisible();
          const b = (await region.boundingBox())!;
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width).toBeLessThanOrEqual(size.width + 0.5);
        }
        if (size.width >= 1200) {
          await expect(page.getByRole("complementary", { name: "Game info" })).toBeVisible();
        }

        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    }
  });
}

test.describe("keyboard-only flow", () => {
  test("select, place, note, undo, and open and close dialogs without a pointer", async ({ page }) => {
    await open(page, "light");

    // Tab until focus lands on the grid's roving-tabindex cell.
    for (let i = 0; i < 30; i++) {
      if (await page.locator(".board [data-cell]:focus").count()) break;
      await page.keyboard.press("Tab");
    }
    await expect(page.locator(".board [data-cell]:focus")).toHaveCount(1);

    // Cell 2 is an empty peer in row 1 (cell 0 is a given).
    await page.locator(cell(0)).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(cell(2))).toBeFocused();

    await page.keyboard.press("4");
    await expect(page.locator(cell(2))).toHaveText("4");

    await page.keyboard.press("ArrowRight");
    await expect(page.locator(cell(3))).toBeFocused();
    await page.keyboard.press("Shift+7");
    await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /notes 7/);

    await page.keyboard.press("Control+z");
    await expect(page.locator(cell(3))).not.toHaveAttribute("aria-label", /notes 7/);
    await page.keyboard.press("Control+z");
    await expect(page.locator(cell(2))).toHaveText("");

    // Dialogs: open with the keyboard on a focused opener, close with Escape, focus returns.
    for (const name of ["Settings", "Shortcuts"]) {
      const opener = page.getByRole("button", { name, exact: true });
      await opener.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
  });
});
