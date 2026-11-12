import { test, expect } from "./fixtures";
test("signup shows a clear error for a short password without a network request", async ({
  page,
}) => {
  let writes = 0;
  await page.route("**/api/auth/sign-up/email", (route) => {
    writes++;
    return route.abort();
  });
  await page.goto("/login?signup=1");
  await page.getByLabel("Your name").fill("Test Owner");
  await page.getByLabel("Work email").fill("feedback@test.invalid");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    "12 to 128 characters",
  );
  expect(writes).toBe(0);
  await expect(
    page.getByRole("button", { name: "Create workspace", exact: true }),
  ).toBeEnabled();
});
test("signup server failures display a retryable error and restore the button", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-up/email", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/login?signup=1");
  await page.getByLabel("Your name").fill("Test Owner");
  await page.getByLabel("Work email").fill("feedback@test.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-test-password-2026");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    "server could not complete",
  );
  await expect(
    page.getByRole("button", { name: "Create workspace", exact: true }),
  ).toBeEnabled();
  await expect(page).toHaveURL(/\/login/);
});
test("sign-in displays server permission errors instead of failing silently", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: '{"message":"Invalid origin"}',
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Work email").fill("feedback@test.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-test-password-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    "website configuration",
  );
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
});

test("signup explains missing email setup without exposing backend diagnostic text", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-up/email", (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "EMAIL_DELIVERY_NOT_CONFIGURED",
        message: "fictional-private-backend-diagnostic",
      },
    }),
  );
  await page.goto("/login?signup=1");
  await page.getByLabel("Your name").fill("Test Owner");
  await page.getByLabel("Work email").fill("feedback@test.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-test-password-2026");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    "Email delivery is not configured",
  );
  await expect(page.locator('.error-box[role="alert"]')).not.toContainText(
    "fictional-private-backend-diagnostic",
  );
  await expect(
    page.getByRole("button", { name: "Create workspace", exact: true }),
  ).toBeEnabled();
});
