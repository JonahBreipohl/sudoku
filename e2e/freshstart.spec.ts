import { test, expect } from "./fixtures";
import { SAMPLE_EASY } from "../src/engine/samples";

const givens = (page: import("@playwright/test").Page) =>
  page.getByRole("gridcell").evaluateAll((cells) => cells.map((c) => (c.textContent ?? "").trim()));

test("a fresh profile starts on a bank puzzle, and a reload resumes it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  const first = (await givens(page)).map((t) => t.replace(/\D/g, "")[0] ?? ".").join("");
  expect(first).not.toBe(SAMPLE_EASY.puzzle);
  await page.reload();
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  expect((await givens(page)).map((t) => t.replace(/\D/g, "")[0] ?? ".").join("")).toBe(first);
});
