import { test as base, expect } from "@playwright/test";
// Existing workflow tests dismiss onboarding explicitly. tour.spec verifies the first-login flow itself.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(
      page.getByRole("dialog", { name: "Workspace tour", exact: true }),
      async () => {
        await page
          .getByRole("button", { name: "Skip tour", exact: true })
          .click();
      },
    );
    await use(page);
  },
});
export { expect };
