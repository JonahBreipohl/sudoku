import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

// The service worker only exists in the production build that Playwright serves.
test.use({ serviceWorkers: "allow" });

test("offline reload serves the app, and New game deals a bank puzzle", async ({ page, context, request }) => {
  const bank = (await (await request.get("/puzzles/easy.json")).json()) as { puzzles: { puzzle: string }[] };
  const bankPuzzles = new Set(bank.puzzles.map((p) => p.puzzle));

  await page.goto("/");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.match("puzzles/easy.json")) !== undefined)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  const board = page.getByRole("grid", { name: "Sudoku board" });
  await expect(board).toBeVisible();
  await expect(page.locator("[data-cell]")).toHaveCount(81);

  // The default level is easy; the dealt puzzle must be one of the bank's, not a worker-generated one.
  const givens = () =>
    page.locator("[data-cell]").evaluateAll((els) =>
      els.map((e) => (e.classList.contains("cell--given") ? (e.textContent ?? "0") : "0")).join(""),
    );
  const before = await givens();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect.poll(givens).not.toBe(before);
  expect(bankPuzzles.has(await givens())).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await context.setOffline(false);
});

test("offline reload serves Display mode", async ({ page, context }) => {
  await page.goto("/?mode=display");
  await expect(page.locator(".display-time")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".display-time")).toBeVisible();
  await expect(page.getByRole("region", { name: "Today's stats" })).toBeVisible();
  await context.setOffline(false);
});

test("offline navigation to another path is not answered with the game", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto("/?mode=display"); // a root navigation is still remembered as the shell
  await context.setOffline(true);
  await expect(page.goto("/some/other/page")).rejects.toThrow();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toHaveCount(0);
  await context.setOffline(false);
});
