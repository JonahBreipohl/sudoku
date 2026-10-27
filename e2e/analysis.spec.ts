import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { SAMPLE_EASY } from "../src/engine/samples";
import { expect, test } from "./fixtures";

// Scripted games: loaded through the ?puzzle= hook (a saved game would otherwise resume) and
// the test clock supplies move gaps, so every diagnosis is deterministic.
interface Scripted {
  puzzle: string;
  solution: string;
  level: "easy" | "hard";
}

const easy: Scripted = { puzzle: SAMPLE_EASY.puzzle.replace(/\./g, "0"), solution: SAMPLE_EASY.solution, level: "easy" };
const bank = JSON.parse(readFileSync("public/puzzles/hard.json", "utf8")) as {
  puzzles: { puzzle: string; solution: string }[];
};
const hard: Scripted = { ...bank.puzzles[0]!, level: "hard" };

const blanksOf = (g: Scripted) => [...g.puzzle].flatMap((c, i) => (c === "0" ? [i] : []));
const sol = (g: Scripted, cell: number) => Number(g.solution[cell]);

async function open(page: Page, g: Scripted) {
  await page.goto(`/?test=1&puzzle=${g.puzzle}&level=${g.level}`);
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
}

/** Types `digit` into `cell` after `gapMs` of fake time. */
async function play(page: Page, cell: number, digit: number, gapMs: number) {
  await page.evaluate((ms) => (window as unknown as { __sudoku: { advance(n: number): void } }).__sudoku.advance(ms), gapMs);
  await page.locator(`[data-cell="${cell}"]`).click();
  await page.keyboard.press(String(digit));
}

async function submitAndAnalyze(page: Page) {
  await page.getByRole("button", { name: /Submit/ }).click();
  await page.getByRole("dialog", { name: "Submit this puzzle?" }).getByRole("button", { name: "Submit" }).click();
  await page.getByRole("dialog", { name: /Not solved yet/ }).getByRole("button", { name: /Analyze mistakes/ }).click();
  const panel = page.getByRole("region", { name: "Analysis" });
  await expect(panel).toContainText("First mistake");
  return panel;
}

const noAxeViolations = async (page: Page) =>
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

test("a quick wrong key next to the right one is diagnosed as a typo", async ({ page }) => {
  await open(page, easy);
  await play(page, 2, sol(easy, 2), 3000);
  await play(page, 6, 8, 0); // 9 is the answer; 8 sits beside it on the keys
  const panel = await submitAndAnalyze(page);
  await expect(panel).toContainText("First mistake: r1c7");
  await expect(panel).toContainText("You placed 8 in r1c7, but the right answer is 9.");
  await expect(panel).toContainText("slip of the finger");
  await noAxeViolations(page);
});

test("a guess is diagnosed when logic at the level cannot settle the cell", async ({ page }) => {
  // A hard puzzle played as "easy": singles stall before the cell settles.
  await open(page, { ...hard, level: "easy" });
  await play(page, 5, sol(hard, 5), 3000);
  await play(page, 3, 3, 3000);
  const panel = await submitAndAnalyze(page);
  await expect(panel).toContainText("First mistake: r1c4");
  await expect(panel).toContainText(/this was a guess/);
  await noAxeViolations(page);
});

test("a deduction mistake names the technique; rewinding and finishing correctly auto-submits", async ({ page }) => {
  await open(page, easy);
  await play(page, 3, sol(easy, 3), 3000);
  await play(page, 2, 1, 3000);
  const panel = await submitAndAnalyze(page);
  await expect(panel).toContainText("First mistake: r1c3");
  await expect(panel).toContainText(/Naked Single showed that/i);
  await expect(panel.getByRole("heading", { name: "What you could have done" })).toBeVisible();
  await noAxeViolations(page);

  await panel.getByTestId("rewind-before-mistake").click();
  await expect(panel).toHaveCount(0);
  const rest = blanksOf(easy).filter((c) => c !== 3);
  await page.evaluate(
    ({ cells, solution }) => {
      const store = (window as unknown as { __sudoku: { store: { dispatch(c: unknown): void } } }).__sudoku.store;
      for (const cell of cells.slice(0, -1))
        store.dispatch({ type: "place", cell, digit: Number(solution[cell]), input: "keyboard" });
    },
    { cells: rest, solution: easy.solution },
  );
  const last = rest[rest.length - 1]!;
  await page.locator(`[data-cell="${last}"]`).click();
  await page.keyboard.press(String(sol(easy, last)));
  await expect(page.getByRole("dialog", { name: /Solved/ })).toBeVisible();
});

test("a correct solve reports its longest stalls and hardest technique", async ({ page }) => {
  await open(page, { ...hard, level: "hard" });
  const cells = blanksOf(hard);
  // One long think up front, then steady play.
  for (const [i, cell] of cells.entries()) {
    if (i === cells.length - 1) break;
    await play(page, cell, sol(hard, cell), i === 0 ? 40_000 : 1000);
  }
  await page.evaluate(() => (window as unknown as { __sudoku: { advance(n: number): void } }).__sudoku.advance(25_000));
  const lastCell = cells[cells.length - 1]!;
  await page.locator(`[data-cell="${lastCell}"]`).click();
  await page.keyboard.press(String(sol(hard, lastCell)));
  const solved = page.getByRole("dialog", { name: /Solved/ });
  await expect(solved).toBeVisible();
  await solved.getByRole("button", { name: "Close" }).click();
  const panel = page.getByRole("region", { name: "Analysis" });
  await expect(panel).toContainText("No mistakes on this path.");
  const technique = panel.locator("div", { has: page.getByText("Hardest technique", { exact: true }) }).last();
  await expect(technique).not.toContainText("None needed");
  await expect(panel.getByRole("heading", { name: "Longest pauses in thinking" })).toBeVisible();
  const stalls = panel.getByRole("listitem");
  await expect(stalls.first()).toContainText("40 s before your move");
  await noAxeViolations(page);
});

test("the analysis panel's last element can be scrolled into view without horizontal scroll", async ({ page }) => {
  await open(page, easy);
  await play(page, 3, sol(easy, 3), 3000);
  await play(page, 2, 1, 3000);
  const panel = await submitAndAnalyze(page);
  const last = panel.getByRole("heading", { name: "What you could have done" });
  await panel.getByRole("button", { name: "Close analysis" }).focus();
  // Last content block of the panel: its final child.
  const tail = panel.locator(":scope > :last-child");
  await tail.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  const vh = page.viewportSize()!.height;
  const box = (await tail.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh + 1);
  // Hit-test: the tail must be what a user sees at its position, not clipped by an ancestor.
  const hit = await tail.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.bottom - 2);
    return top !== null && el.contains(top);
  });
  expect(hit).toBe(true);
  // The panel itself must be fully inside the viewport or scroll internally.
  const m = await panel.evaluate((el) => ({
    clipped: el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "visible",
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    right: el.getBoundingClientRect().right - window.innerWidth,
  }));
  expect(m.clipped).toBe(false);
  expect(m.page).toBeLessThanOrEqual(0);
  expect(m.right).toBeLessThanOrEqual(0);
  // Timeline slider (the other end of the panel) is reachable too.
  const slider = panel.getByRole("slider");
  if (await slider.count()) {
    await slider.scrollIntoViewIfNeeded();
    const sb = (await slider.boundingBox())!;
    expect(sb.y + sb.height).toBeLessThanOrEqual(vh + 1);
  }
});
