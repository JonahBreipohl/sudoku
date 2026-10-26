import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const cell = (n: number) => `[data-cell="${n}"]`;
// SAMPLE_EASY is the default puzzle: cell 0 is a given 5, cells 2-4 are empty peers in row 1.
const pad = (page: Page) => page.getByRole("group", { name: /^Number pad/ });
const padKey = (page: Page, d: number) => pad(page).getByRole("button", { name: new RegExp(`^${d}\\b`) });

async function setDigitFirst(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("radio", { name: "Digit first" }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

test("cell-first entry: select a cell, then a key or a pad button places the digit", async ({ page }) => {
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await expect(page.locator(cell(2))).toHaveText("4");
  await page.locator(cell(3)).click();
  await padKey(page, 6).click();
  await expect(page.locator(cell(3))).toHaveText("6");
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /6/);
});

test("digit-first entry: lock a digit, tap cells to place, tap again to erase, Escape unlocks", async ({ page }) => {
  await setDigitFirst(page);
  await padKey(page, 4).click();
  await expect(padKey(page, 4)).toHaveAttribute("aria-pressed", "true");
  await page.locator(cell(2)).click();
  await page.locator(cell(3)).click();
  await expect(page.locator(cell(2))).toHaveText("4");
  await expect(page.locator(cell(3))).toHaveText("4");
  // Tapping a cell that already holds the locked digit erases it.
  await page.locator(cell(3)).click();
  await expect(page.locator(cell(3))).toHaveText("");
  // Givens are untouched.
  await page.locator(cell(0)).click();
  await expect(page.locator(cell(0))).toHaveText("5");

  await page.keyboard.press("Escape");
  await expect(padKey(page, 4)).not.toHaveAttribute("aria-pressed", "true");
  await page.locator(cell(3)).click();
  await expect(page.locator(cell(3))).toHaveText("");

  // The keyboard locks a digit too, and pressing it again releases it.
  await page.keyboard.press("6");
  await expect(padKey(page, 6)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("6");
  await expect(padKey(page, 6)).not.toHaveAttribute("aria-pressed", "true");
});

test("notes by toggle button, N key and Shift+digit; pad switches to notes mode", async ({ page }) => {
  const toggle = page.getByRole("button", { name: /^.?\s*Notes:/ });
  await page.locator(cell(2)).click();

  // Toggle button.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Number pad, notes mode" })).toBeVisible();
  await padKey(page, 1).click();
  await padKey(page, 3).click();
  await expect(page.locator(cell(2))).toHaveAttribute("aria-label", /notes 1 3/);
  // Pressing a noted digit again removes it.
  await padKey(page, 1).click();
  await expect(page.locator(cell(2))).toHaveAttribute("aria-label", /notes 3$/);

  // N key turns the mode off, and digits place again.
  await page.locator(cell(2)).click();
  await page.keyboard.press("n");
  await expect(toggle).not.toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("n");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("n");

  // Shift+digit notes without changing the toggle.
  await page.keyboard.press("Shift+7");
  await expect(toggle).not.toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(cell(2))).toHaveAttribute("aria-label", /notes 3 7/);
});

test("placing a digit removes it from peer notes only", async ({ page }) => {
  await page.getByRole("button", { name: "Fill notes" }).click();
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

test("undo and redo work from the keyboard and the buttons", async ({ page }) => {
  const undo = page.getByRole("button", { name: /Undo/ });
  const redo = page.getByRole("button", { name: /Redo/ });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await page.keyboard.press("5");
  await expect(page.locator(cell(2))).toHaveText("5");
  await expect(undo).toBeEnabled();

  await page.keyboard.press("Control+z");
  await expect(page.locator(cell(2))).toHaveText("4");
  await expect(redo).toBeEnabled();
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
  await redo.click();
  await expect(page.locator(cell(2))).toHaveText("4");
  await redo.click();
  await expect(page.locator(cell(2))).toHaveText("5");
  await expect(redo).toBeDisabled();
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

test("reset asks first, cancel keeps the board, confirm clears it, and undo restores it", async ({ page }) => {
  const reset = page.getByRole("button", { name: /Reset/ });
  const dialog = page.getByRole("dialog", { name: "Reset this puzzle?" });
  await expect(reset).toBeDisabled();
  await page.locator(cell(2)).click();
  await page.keyboard.press("4");
  await page.locator(cell(3)).click();
  await page.keyboard.press("Shift+5");

  await reset.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(reset).toBeFocused();
  await expect(page.locator(cell(2))).toHaveText("4");

  await reset.click();
  await dialog.getByRole("button", { name: "Keep playing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(cell(2))).toHaveText("4");

  await reset.click();
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(cell(2))).toHaveText("");
  await expect(page.locator(cell(3))).not.toHaveAttribute("aria-label", /notes/);
  await expect(page.locator(cell(0))).toHaveText("5");

  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(page.locator(cell(2))).toHaveText("4");
  await expect(page.locator(cell(3))).toHaveAttribute("aria-label", /notes 5/);
});

for (const theme of ["light", "dark"] as const) {
  test(`board with notes, digit entry and the reset dialog is accessible in ${theme} theme`, async ({ page }) => {
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
    await page.getByRole("button", { name: /Reset/ }).click();
    await expect(page.getByRole("dialog", { name: "Reset this puzzle?" })).toBeVisible();
    expect(await scan()).toEqual([]);
  });
}
