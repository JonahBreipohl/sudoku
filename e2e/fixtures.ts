import { test as base, expect, type Page } from "@playwright/test";

/** Fails any test that logs a console error or throws an uncaught page error. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(err.message));
      await use(errors);
      expect(errors, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Seeds stored settings before the app loads, e.g. { assist: "hard" }. Later changes persist across reloads. */
export async function presetSettings(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => {
    if (localStorage.getItem("sudoku:v1:settings") === null) localStorage.setItem("sudoku:v1:settings", JSON.stringify(s));
  }, settings);
}

/** The number pad shows on touch screens only; elsewhere digits are typed. */
export async function enterDigit(page: Page, digit: number) {
  const pad = page.getByRole("group", { name: /^Number pad/ });
  if (await pad.isVisible()) await pad.getByRole("button", { name: new RegExp(`^${digit}\\b`) }).click();
  else await page.keyboard.press(String(digit));
}
