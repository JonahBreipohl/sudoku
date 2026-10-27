import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "allow" });

test("manifest is valid and linked", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const res = await request.get(new URL(href ?? "", page.url()).href);
  expect(res.ok()).toBe(true);
  const m = (await res.json()) as { name: string; start_url: string; scope: string; display: string; icons: { src: string; sizes: string; purpose?: string }[] };
  expect(m.name).toBeTruthy();
  expect(m.display).toBe("standalone");
  expect(m.start_url.startsWith("/")).toBe(false);
  expect(m.scope.startsWith("/")).toBe(false);
  expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, new URL(href ?? "", page.url())).href);
    expect(r.ok(), icon.src).toBe(true);
  }
});

test("reloads offline and keeps a game in progress", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // The bank must be precached, not just whatever the first page happened to fetch.
  const cached = await page.evaluate(async () => (await caches.match("puzzles/master.json")) !== undefined);
  expect(cached).toBe(true);

  const cellEl = page.locator("[data-cell]").first();
  const before = await page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.textContent).join(","));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await expect(cellEl).toBeVisible();
  const after = await page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.textContent).join(","));
  expect(after).toBe(before);
  await context.setOffline(false);
});
