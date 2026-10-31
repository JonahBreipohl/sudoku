import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

const sizes = [
  { name: "tablet 820x1180", width: 820, height: 1180 },
  { name: "desktop 1440x900", width: 1440, height: 900 },
];

for (const size of sizes) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    for (const scheme of ["light", "dark"] as const) {
      test(`fits without scrolling, panel and history work (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto("/?test=1");
        const grid = page.getByRole("grid", { name: "Sudoku board" });
        await expect(grid).toBeVisible();

        const fit = await page.evaluate(() => {
          const app = document.querySelector(".app")!;
          return {
            appY: app.scrollHeight <= app.clientHeight,
            appX: app.scrollWidth <= app.clientWidth,
            pageY: document.documentElement.scrollHeight <= window.innerHeight,
            pageX: document.documentElement.scrollWidth <= window.innerWidth,
          };
        });
        expect(fit).toEqual({ appY: true, appX: true, pageY: true, pageX: true });

        const board = (await page.locator(".board").boundingBox())!;
        const side = (await page.locator(".play-side").boundingBox())!;
        expect(side.x).toBeGreaterThanOrEqual(board.x + board.width);
        await expect(page.getByRole("timer", { name: "Elapsed time" })).toBeVisible();
        await expect(page.getByText("No moves yet.")).toBeVisible();

        // Make two moves on empty cells, undo one: newest first, undone entry marked.
        const cells = await page.locator("[data-cell]").evaluateAll((els) =>
          els.filter((e) => !/given/.test(e.className)).map((e) => Number(e.getAttribute("data-cell"))),
        );
        await page.locator(`[data-cell="${cells[0]}"]`).click();
        await page.keyboard.press("1");
        await page.locator(`[data-cell="${cells[1]}"]`).click();
        await page.keyboard.press("2");
        await page.keyboard.press("Control+z");
        const items = page.locator(".history-item");
        await expect(items).toHaveCount(2);
        await expect(items.first()).toContainText("undone");
        await expect(items.first()).toContainText(/r\dc\d = 2/);
        await expect(items.last()).toHaveAttribute("aria-current", "step");
        await expect(items.last()).toContainText(/r\dc\d = 1/);

        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      });
    }

    test("history is reached after controls and pad in tab order", async ({ page }) => {
      await page.goto("/?test=1");
      const order = await page.evaluate(() => {
        const sel = [".board [data-cell]", ".controls button", ".pad button", ".history-scroll"];
        const els = [...document.querySelectorAll<HTMLElement>("button, [tabindex='0']")]
          .filter((e) => e.closest(".play"))
          .filter((e) => e.tabIndex >= 0);
        const rank = (e: Element) => sel.findIndex((s) => e.matches(s));
        return els.map(rank);
      });
      expect(order.every((r) => r >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(order[order.length - 1]).toBe(3);
      await page.locator(".pad button").last().focus();
      await page.keyboard.press("Tab");
      await expect(page.locator(".history-scroll")).toBeFocused();
    });
  });
}

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("side panel is not shown or focusable", async ({ page }) => {
    await page.goto("/?test=1");
    await expect(page.locator(".history-scroll")).toBeHidden();
  });
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test.describe(`header and panel alignment ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("header gaps are even and the panel top matches the board", async ({ page }) => {
      await page.goto("/?test=1");
      const grid = page.getByRole("grid", { name: "Sudoku board" });
      await expect(grid).toBeVisible();
      const m = await page.evaluate(() => {
        const header = document.querySelector(".app-header")!;
        const kids = [...header.children]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0);
        const gaps = kids.slice(1).map((r, i) => Math.round(r.left - kids[i]!.right));
        const board = document.querySelector(".board")!.getBoundingClientRect();
        const side = document.querySelector(".play-side")!.getBoundingClientRect();
        return {
          gaps,
          boardTop: board.top,
          sideTop: side.top,
          scrollX: document.documentElement.scrollWidth <= window.innerWidth,
        };
      });
      // Exactly one larger gap (between the two groups); every other gap is 8px.
      const big = m.gaps.filter((g) => g !== 8);
      expect(big.length).toBeLessThanOrEqual(1);
      if (big[0] !== undefined) expect(big[0]).toBeGreaterThan(8);
      expect(Math.abs(m.sideTop - m.boardTop)).toBeLessThanOrEqual(2);
      expect(m.scrollX).toBe(true);
    });
  });
}
