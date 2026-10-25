import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

const cell = (n: number) => `[data-cell="${n}"]`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

test("renders 81 cells with givens", async ({ page }) => {
  await expect(page.locator("[data-cell]")).toHaveCount(81);
  await expect(page.locator(cell(0))).toHaveText("5");
  await expect(page.locator(cell(0))).toHaveAttribute("aria-label", "Row 1, column 1, 5, given");
});

test("selects by click and moves with arrow keys", async ({ page }) => {
  await page.locator(cell(2)).click();
  await expect(page.locator(cell(2))).toHaveClass(/cell--selected/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(cell(11))).toHaveClass(/cell--selected/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(cell(12))).toHaveClass(/cell--selected/);
});

test("enters digits from the keyboard and the pad, and erases", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.keyboard.press("Backspace");
  await expect(page.locator(cell(2))).toHaveText("");

  await page.getByRole("group", { name: "Number pad" }).getByRole("button", { name: /^4\b/ }).click();
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.getByRole("button", { name: "Erase" }).click();
  await expect(page.locator(cell(2))).toHaveText("");
});

test("does not change givens", async ({ page }) => {
  await page.locator(cell(0)).click();
  await page.keyboard.press("9");
  await expect(page.locator(cell(0))).toHaveText("5");
});

test("marks conflicts without relying on color", async ({ page }) => {
  // Cell 2 shares row 1 with the given 5 in cell 0.
  await page.locator(cell(2)).click();
  await page.keyboard.press("5");
  await expect(page.locator(cell(2))).toHaveClass(/cell--conflict/);
  await expect(page.locator(cell(2))).toHaveAttribute("aria-label", /conflict/);
});

test("theme toggle cycles and persists", async ({ page }) => {
  const toggle = page.getByRole("button", { name: /^Theme:/ });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("has no horizontal scroll", async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`has no serious accessibility violations in ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("resumes board and timer after reload", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.locator("[data-cell]")).toHaveCount(81);
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.evaluate(() => {
    const w = window as unknown as { __sudoku: { advance(ms: number): void } };
    w.__sudoku.advance(60_000);
  });
  await page.keyboard.press("Backspace");
  await page.keyboard.press("4");
  await page.reload();
  await expect(page.locator(cell(2))).toHaveText("4");
  const log = await page.evaluate(() => {
    const w = window as unknown as {
      __sudoku: { store: { getSnapshot(): { record: { log: { type: string }[]; nodes: unknown[] } } } };
    };
    const r = w.__sudoku.store.getSnapshot().record;
    return { types: r.log.map((e) => e.type), nodes: r.nodes.length };
  });
  expect(log.nodes).toBe(3);
  // One start, and the reload closed the clock (hidden) then reopened it (visible).
  expect(log.types.filter((t) => t === "start")).toHaveLength(1);
  expect(log.types).toContain("hidden");
  expect(log.types.at(-1)).toBe("visible");
});

test("renders notes as a 3x3 grid with a labelled cell", async ({ page }) => {
  await page.goto("/?test=1");
  await page.evaluate(() => {
    const s = (window as unknown as { __sudoku: { store: { dispatch(c: unknown): void } } }).__sudoku.store;
    for (const digit of [1, 4, 9]) s.dispatch({ type: "note", cell: 2, digit, on: true });
  });
  const c = page.locator(cell(2));
  await expect(c).toHaveAttribute("aria-label", "Row 1, column 3, empty, notes 1 4 9");
  await expect(c.locator(".note")).toHaveCount(9);
  await expect(c.locator(".note")).toHaveText(["1", "", "", "4", "", "", "", "", "9"]);
  await expect(c).toHaveClass(/cell--noted/);
});

test("a single placement re-renders only the affected cells", async ({ page }) => {
  await page.goto("/?test=1");
  await page.locator(cell(2)).click();
  const total = async () =>
    (await page.evaluate(() => (window as unknown as { __sudoku: { cellCommits(): number[] } }).__sudoku.cellCommits())).reduce(
      (a, b) => a + b,
      0,
    );
  const before = await total();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  // The placed cell, cells sharing the digit, and conflicts; never the whole board.
  expect((await total()) - before).toBeLessThan(15);
});

test("highlights peers and same digits with non-color cues", async ({ page }) => {
  await page.locator(cell(0)).click();
  await expect(page.locator(".cell--related")).toHaveCount(20);
  await expect(page.locator(".cell--same").first()).toBeVisible();
  const shadow = await page.locator(".cell--same").first().evaluate((e) => getComputedStyle(e).boxShadow);
  expect(shadow).not.toBe("none");
  const image = await page.locator(".cell--related").first().evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(image).toContain("gradient");
});
