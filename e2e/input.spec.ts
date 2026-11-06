import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { enterDigit, expect, test } from "./fixtures";

const cell = (n: number) => `[data-cell="${n}"]`;
// SAMPLE_EASY is the default puzzle: cell 0 is a given 5, cells 2-4 are empty peers in row 1.
const pad = (page: Page) => page.getByRole("group", { name: /^Number pad/ });
const padKey = (page: Page, d: number) => pad(page).getByRole("button", { name: new RegExp(`^${d}\\b`) });

test.beforeEach(async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

test("select a cell, then a key (or a pad button on touch screens) places the digit", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.locator(cell(3)).click();
  await enterDigit(page, 6);
  await expect(page.locator(cell(3))).toHaveText("6");
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /6/);
});

test("notes by N key and Shift+digit; on touch screens the pad switches to notes mode", async ({ page }, info) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("n");
  if (info.project.name === "phone") {
    await expect(page.getByRole("group", { name: "Number pad, notes mode" })).toBeVisible();
    await padKey(page, 1).click();
    await padKey(page, 3).click();
  } else {
    await expect(page.locator(".keys-hint")).toHaveText(/Notes on/);
    await page.keyboard.press("1");
    await page.keyboard.press("3");
  }
  await expect(page.locator(cell(2))).toHaveAttribute("aria-label", /notes 1 3/);
  // Pressing a noted digit again removes it.
  await page.keyboard.press("1");
  await expect(page.locator(cell(2))).toHaveAttribute("aria-label", /notes 3$/);

  // N turns the mode off, and Shift+digit notes without turning it on.
  await page.keyboard.press("n");
  await page.keyboard.press("Shift+7");
  await expect(page.locator(cell(2))).toHaveAttribute("aria-label", /notes 3 7/);
  await page.keyboard.press("8");
  await expect(page.locator(cell(2))).toHaveText("8");
});

test("placing a digit removes it from peer notes only", async ({ page }) => {
  await page.evaluate(() =>
    (window as unknown as { __sudoku: { store: { dispatch(c: unknown): void } } }).__sudoku.store.dispatch({ type: "auto-notes" }),
  );
  // Cell 2 and cell 3 share row 1; find a digit noted in both.
  const notesOf = async (n: number) => {
    const label = (await page.locator(cell(n)).getAttribute("aria-label")) ?? "";
    return (/notes ([\d ]+)/.exec(label)?.[1] ?? "").split(" ").filter(Boolean);
  };
  const peerNotes = await notesOf(3);
  const digit = (await notesOf(2)).find((d) => peerNotes.includes(d));
  expect(digit, "a digit noted in both peer cells").toBeDefined();

  // Non-peers of cell 2 (row 1, column 3, box 1) sit in rows 4-9 and outside column 3.
  const farLabels = () =>
    page.locator("[data-cell]").evaluateAll((els) =>
      els.filter((e) => Number(e.getAttribute("data-cell")) >= 27 && Number(e.getAttribute("data-cell")) % 9 !== 2).map((e) => e.getAttribute("aria-label")),
    );
  const farBefore = await farLabels();
  await page.locator(cell(2)).click();
  await page.keyboard.press(digit!);
  await expect(page.locator(cell(2))).toHaveText(digit!);
  await expect.poll(() => notesOf(3)).not.toContain(digit);
  // Cells outside every unit of cell 2 keep their notes.
  expect(await farLabels()).toEqual(farBefore);
});

test("undo works from the keyboard and the button, redo from the keyboard", async ({ page }) => {
  const undo = page.getByRole("button", { name: /Undo/ });
  await expect(undo).toBeDisabled();

  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await page.keyboard.press("5");
  await expect(page.locator(cell(2))).toHaveText("5");
  await expect(undo).toBeEnabled();

  await page.keyboard.press("Control+z");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(cell(2))).toHaveText("5");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  await expect(page.locator(cell(2))).toHaveText("5");

  await undo.click();
  await expect(page.locator(cell(2))).toHaveText("4");
  await undo.click();
  await expect(page.locator(cell(2))).toHaveText("");
  await expect(undo).toBeDisabled();
  await page.keyboard.press("Control+y");
  await expect(page.locator(cell(2))).toHaveText("4");
});

test("undo reverts a note and a peer-note removal together with the placement", async ({ page }) => {
  await page.locator(cell(3)).click();
  await page.keyboard.press("Shift+4");
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /notes 4/);
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(3))).not.toHaveAttribute("aria-label", /notes/);
  await page.keyboard.press("Control+z");
  await expect(page.locator(cell(2))).toHaveText("");
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /notes 4/);
});

for (const theme of ["light", "dark"] as const) {
  test(`board with notes and digit entry is accessible in ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.locator(cell(2)).click();
    await page.keyboard.press("4");
    await page.keyboard.press("Shift+7");
    await page.locator(cell(3)).click();
    await page.keyboard.press("Shift+2");
    const scan = async () => {
      const results = await new AxeBuilder({ page }).analyze();
      return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`);
    };
    expect(await scan()).toEqual([]);
  });
}

test("placement animation marks only the changed cell and not a reload", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2) + " .digit")).toHaveAttribute("data-pop", "");
  await expect(page.locator("[data-pop]")).toHaveCount(1);
  await expect(page.locator(cell(2))).not.toHaveClass(/cell--shake/);
  // Selecting another cell does not replay anything.
  await page.locator(cell(3)).click();
  await expect(page.locator(cell(3) + " .digit")).toHaveCount(0);
  // A conflicting digit (5 duplicates the given in row 1) shakes.
  await page.keyboard.press("5");
  await expect(page.locator(cell(3))).toHaveClass(/cell--shake/);
  await page.reload();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await expect(page.locator("[data-pop]")).toHaveCount(0);
  await expect(page.locator(".cell--shake")).toHaveCount(0);
});
