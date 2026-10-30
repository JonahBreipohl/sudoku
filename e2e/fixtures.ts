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

/** Clicks a header action, going through the "More" menu when the header is in its phone layout. */
export async function clickHeaderAction(page: Page, name: string) {
  const more = page.getByRole("button", { name: /^More/ });
  if (await more.isVisible()) {
    await more.click();
    await page.locator("#more-menu").getByRole("button", { name, exact: true }).click();
  } else {
    await page.getByRole("button", { name, exact: true }).click();
  }
}
