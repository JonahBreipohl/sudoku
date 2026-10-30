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
  // Entering Display paused the game; Resume brings the board back.
  await page.getByRole("button", { name: "Resume" }).click();
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

test("display is idle between ticks: no rAF loop and no running animations", async ({ page }) => {
  // Mid drift step at midday: crossing a 5-minute step (or night) during the wait starts the
  // intended long drift transition, which this test would otherwise count as a running animation.
  const step = 5 * 60 * 1000;
  await page.clock.setFixedTime(Math.floor(Date.UTC(2026, 9, 30, 12) / step) * step + step / 2);
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number };
    w.__raf = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      w.__raf++;
      return orig(cb);
    };
  });
  await page.goto("/?mode=display");
  await expect(page.locator(".display-time")).toBeVisible();
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  expect(after - before).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("reduced motion removes the drift transition but keeps the offset", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mode=display");
  const body = page.locator(".display-body");
  await expect(body).toBeVisible();
  // A global reduced-motion rule may clamp to 1e-6s rather than 0s; either means no visible transition.
  const dur = await body.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(dur).toBeLessThan(0.001);
  expect(await body.evaluate((el) => el.style.getPropertyValue("--drift-x"))).toMatch(/^-?\d+px$/);
});

test("Display pauses the game and keeps the selection across a round trip", async ({ page }) => {
  await page.goto("/");
  const cell = page.locator('[data-cell="40"]');
  await cell.click();
  await expect(cell).toHaveClass(/cell--selected/);
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await expect(page.locator(".display-time")).toBeVisible();
  // Digits typed in Display must not reach the hidden board.
  await page.keyboard.press("5");
  await page.getByRole("button", { name: "Exit Display" }).click();
  const resume = page.getByRole("button", { name: "Resume" });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.locator('[data-cell="40"]')).toHaveClass(/cell--selected/);
});

test("watch puzzle self-solves with a technique caption", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?mode=display&watch&seed=e2e&interval=1");
  const board = page.getByRole("grid", { name: "Watch puzzle, solving itself" });
  await expect(board).toBeVisible();
  const caption = page.locator(".watch-caption strong");
  await expect(caption).toBeVisible({ timeout: 6000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Watch puzzle" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  for (const [name, size] of [["landscape", { width: 1920, height: 1080 }], ["portrait", { width: 1080, height: 1920 }]] as const) {
    for (const watch of [false, true]) {
      test(`display ${name} ${watch ? "watch puzzle" : "board"} shows clock, puzzle, stats; axe clean (${scheme})`, async ({ page }) => {
        // Reduced motion: the watch caption otherwise fades, and axe would sample mid-fade colors.
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.setViewportSize(size);
        await page.goto(watch ? "/?mode=display&watch&seed=e2e&interval=1" : "/?mode=display");
        await expect(page.locator(".display-time")).toBeVisible();
        await expect(
          page.getByRole("grid", { name: watch ? "Watch puzzle, solving itself" : "Current game, read only" }),
        ).toBeVisible();
        await expect(page.getByRole("region", { name: "Today's stats" })).toBeVisible();
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
      });
    }
  }
}

test("watch puzzle noted cells pass label-content-name-mismatch", async ({ page }) => {
  await page.goto("/?mode=display&watch&seed=e2e&interval=1");
  await expect(page.getByRole("grid", { name: "Watch puzzle, solving itself" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withRules(["label-content-name-mismatch"]).analyze();
  expect(results.violations).toEqual([]);
});
