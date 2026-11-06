import type { Page } from "@playwright/test";
import { test, expect, enterDigit } from "./fixtures";

// The Hanami scene renders on demand: one frame at start, then nothing until petals fly
// (docs/ARCHITECTURE.md, "Testing hooks" for window.__sudokuScene). Headless Chromium renders
// WebGL in software, where the app keeps the CSS still unless ?scene=webgl forces the scene.

const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
// Two blanks: r1c1 completes row 1, column 1 and box 1; r9c9 then solves the puzzle.
const NEAR = "." + SOLUTION.slice(1, 80) + ".";

type Hook = { frames(): number; looping(): boolean; ready(): boolean };
const scene = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __sudokuScene: Hook }).__sudokuScene;
  return { frames: s.frames(), looping: s.looping(), ready: s.ready() };
});

async function sceneReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __sudokuScene?: Hook }).__sudokuScene?.ready(), null, { timeout: 20_000 });
}

/** Frames stop: once the scene has settled, the counter holds still. */
async function expectIdle(page: Page) {
  await expect.poll(async () => (await scene(page)).looping, { timeout: 10_000 }).toBe(false);
  // Settled: no frame for a moment (start-up and layout frames come first, at their own pace).
  let last = -1;
  await expect
    .poll(async () => {
      const now = (await scene(page)).frames;
      const settled = now === last;
      last = now;
      return settled;
    }, { intervals: [600], timeout: 15_000 })
    .toBe(true);
  const before = (await scene(page)).frames;
  await page.waitForTimeout(1200);
  const after = await scene(page);
  expect(after.frames).toBe(before);
  expect(after.looping).toBe(false);
}

test("the scene canvas is decorative: hidden from assistive tech, inert and behind the app", async ({ page }) => {
  await page.goto("/?test=1&scene=webgl");
  await sceneReady(page);
  const layer = page.locator(".scene");
  await expect(layer).toHaveAttribute("aria-hidden", "true");
  const canvas = layer.locator("canvas");
  await expect(canvas).toHaveCount(1);
  expect(await canvas.evaluate((c) => getComputedStyle(c).pointerEvents)).toBe("none");
  expect(await canvas.evaluate((c) => c.tabIndex)).toBe(-1);
  // The board stays clickable over it.
  await page.getByRole("gridcell").first().click();
});

test("Play renders once and then stays idle", async ({ page }) => {
  await page.goto("/?test=1&scene=webgl");
  await sceneReady(page);
  await expectIdle(page);
});

test("Display renders a still and never loops", async ({ page }) => {
  await page.goto("/?test=1&scene=webgl&mode=display");
  await sceneReady(page);
  await expectIdle(page);
});

test("completing a unit blows a gust that stops on its own, and solving brings a storm", async ({ page }) => {
  await page.goto(`/?test=1&scene=webgl&puzzle=${NEAR}&level=easy`);
  await sceneReady(page);
  await expectIdle(page);

  const start = (await scene(page)).frames;
  await page.locator('[data-cell="0"]').click();
  await enterDigit(page, 5);
  await expect.poll(async () => (await scene(page)).looping).toBe(true);
  await expect.poll(async () => (await scene(page)).frames).toBeGreaterThan(start + 2);
  // The gust lasts about 2.5 s.
  await expectIdle(page);

  const beforeStorm = (await scene(page)).frames;
  await page.locator('[data-cell="80"]').click({ force: true });
  await enterDigit(page, 9);
  await expect.poll(async () => (await scene(page)).looping).toBe(true);
  await expect.poll(async () => (await scene(page)).frames).toBeGreaterThan(beforeStorm + 2);
  await expectIdle(page);
});

test("reduced motion keeps the still frame: no gust after completing a unit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?test=1&scene=webgl&puzzle=${NEAR}&level=easy`);
  await sceneReady(page);
  await expectIdle(page);
  await page.locator('[data-cell="0"]').click();
  await enterDigit(page, 5);
  await expect(page.locator('[data-cell="0"]')).toContainText("5");
  await expectIdle(page);
});

test("a theme change re-renders one frame and stays idle", async ({ page }) => {
  await page.goto("/?test=1&scene=webgl");
  await sceneReady(page);
  await expectIdle(page);
  const before = (await scene(page)).frames;
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect.poll(async () => (await scene(page)).frames).toBeGreaterThan(before);
  await expectIdle(page);
});

test("a software renderer keeps the CSS and SVG still", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.locator(".scene-fallback svg").first()).toBeVisible();
  await expect(page.locator(".scene canvas")).toHaveCount(0);
  expect((await scene(page)).frames).toBe(0);
});

test("without WebGL2 the CSS and SVG fallback stays", async ({ page }) => {
  await page.addInitScript(() => {
    // Simulates a browser with no WebGL2 at all.
    Object.defineProperty(window, "WebGL2RenderingContext", { value: undefined });
  });
  await page.goto("/?test=1&scene=webgl");
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.locator(".scene-fallback svg").first()).toBeVisible();
  await expect(page.locator(".scene canvas")).toHaveCount(0);
});
