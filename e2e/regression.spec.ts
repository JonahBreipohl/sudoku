// Gap-fillers from the M10-08 sweep: must-haves that no other spec exercised directly.
import { expect, test, clickHeaderAction } from "./fixtures";

const cell = (n: number) => `[data-cell="${n}"]`;

test("movement keys: WASD and hjkl move the selection like the arrows", async ({ page }) => {
  await page.goto("/?test=1");
  await page.locator(cell(40)).click();
  const moves: [string, number][] = [
    ["d", 41],
    ["a", 40],
    ["s", 49],
    ["w", 40],
    ["l", 41],
    ["h", 40],
    ["j", 49],
    ["k", 40],
  ];
  for (const [key, expected] of moves) {
    await page.keyboard.press(key);
    await expect(page.locator(cell(expected))).toBeFocused();
  }
});

test("0, Backspace and Delete all erase a player digit", async ({ page }) => {
  await page.goto("/?test=1");
  const target = page.locator(cell(2));
  for (const key of ["0", "Backspace", "Delete"]) {
    await target.click();
    await page.keyboard.press("4");
    await expect(target).toHaveAttribute("aria-label", /4/);
    await page.keyboard.press(key);
    await expect(target).not.toHaveAttribute("aria-label", /\b4\b/);
  }
});

test("a hidden tab logs hidden then visible so the timer stops", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  const types = () =>
    page.evaluate(() =>
      (window as unknown as { __sudoku: { store: { getSnapshot(): { record: { log: { type: string }[] } } } } })
        .__sudoku.store.getSnapshot().record.log.map((e) => e.type),
    );
  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await setVisibility("hidden");
  await expect.poll(types).toContain("hidden");
  await setVisibility("visible");
  await expect.poll(async () => (await types()).at(-1)).toBe("visible");
});

test("wall clock shows in the desktop side panel and is absent on phones", async ({ page }, info) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  const clock = page.locator(".panel-clock").filter({ hasText: "Clock" });
  if (info.project.name === "desktop") await expect(clock).toBeVisible();
  else await expect(clock).toBeHidden();
});

test("idle time switches Play to Display and pauses the game", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await page.clock.fastForward("11:00");
  await expect(page.locator(".display-time")).toBeVisible();
  await page.getByRole("button", { name: "Exit Display" }).click();
  await expect(page.getByRole("region", { name: "Game paused" })).toBeVisible();
});

test("Stats dialog reports every difficulty level", async ({ page }) => {
  await page.goto("/?test=1");
  await clickHeaderAction(page, "Stats");
  const dialog = page.getByRole("dialog", { name: "Statistics" });
  await expect(dialog).toBeVisible();
  for (const level of ["Easy", "Medium", "Hard", "Expert", "Master"])
    await expect(dialog).toContainText(level);
  await expect(dialog).toContainText("Daily puzzle");
});
