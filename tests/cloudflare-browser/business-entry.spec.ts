import { test, expect } from "@playwright/test";
test("agency, hotel owner and guest entry points are explicit and keep their own navigation", async ({
  page,
}) => {
  const serverFailures: string[] = [];
  const pageErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500)
      serverFailures.push(
        `${response.status()} ${new URL(response.url()).pathname}`,
      );
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const business = page.getByRole("navigation", {
      name: "Choose your business workspace",
    }),
    main = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    business.getByRole("heading", { name: "Travel agencies", exact: true }),
  ).toBeVisible();
  await expect(
    business.getByRole("link", { name: "Create your agency" }),
  ).toHaveAttribute("href", "/login?signup=1");
  expect(
    await page
      .locator(".hero")
      .evaluate(
        (el) =>
          el.compareDocumentPosition(document.querySelector("#workspaces")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  ).toBeTruthy();
  await expect(
    page.getByRole("img", { name: /Travel coordinators/ }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Agency sign in", exact: true }),
  ).toHaveAttribute("href", "/login");
  await expect(
    main.getByRole("link", { name: "Hotel owners", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/agency-entry-desktop.png",
    fullPage: true,
  });
  await business
    .getByRole("link", { name: "Hotel owners", exact: true })
    .click();
  await expect(page).toHaveURL(/\/hotel-business$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your hotel workspace.",
  );
  // The supplied WebP is already compressed. Owner entry must work without
  // Cloudflare Images, which is intentionally not provisioned on this app.
  const welcomeImage = page.locator(".hotel-welcome-photo img");
  await expect(welcomeImage).not.toHaveAttribute("src", /\/_next\/image/);
  await expect
    .poll(() =>
      welcomeImage.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your hotel workspace.",
  );
  await expect(
    main.getByRole("link", { name: "Hotel owner sign in", exact: true }),
  ).toHaveAttribute("href", "/login?next=hotelier");
  await expect(
    main.getByRole("link", { name: "Find a hotel · for guests", exact: true }),
  ).toHaveAttribute("href", "/stays");
  await expect(
    main.getByRole("link", { name: "Agency sign in", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/hotel-business-entry-desktop.png",
    fullPage: true,
  });
  await main
    .getByRole("link", { name: "Hotel owner sign in", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hotel owner sign in.",
  );
  await expect(
    page.getByRole("button", {
      name: "New here? Create a hotel account",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Forgot password?", exact: true }),
  ).toHaveAttribute("href", "/forgot-password?next=hotelier");
  await page.goto("/login?signup=1&next=hotelier");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Create your hotel-owner account.",
  );
  await page
    .getByRole("navigation", { name: "Choose account workspace" })
    .getByRole("link", { name: "Travel agency", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Let’s build your agency.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/hotel-business", "/login?next=hotelier"]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    if (path === "/hotel-business")
      await page.screenshot({
        path: "test-results/hotel-business-entry-mobile.png",
        fullPage: true,
      });
  }
  expect(serverFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});
test("hotel password recovery preserves the hotel destination and agency recovery keeps its default", async ({
  page,
}) => {
  let request: { redirectTo?: string } = {};
  await page.route("**/api/auth/request-password-reset", async (route) => {
    request = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      json: { status: true, message: "accepted" },
    });
  });
  await page.goto("/forgot-password?next=hotelier");
  await expect(
    page.getByRole("link", { name: "Back to sign in", exact: true }),
  ).toHaveAttribute("href", "/login?next=hotelier");
  await page
    .getByLabel("Account email", { exact: true })
    .fill("hotel-recovery@test.invalid");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("If the account exists");
  expect(request.redirectTo).toBe("/reset-password?next=hotelier");
  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill({ status: 200, json: { status: true } }),
  );
  await page.goto(
    "/reset-password?token=fictional-hotel-reset-token&next=hotelier",
  );
  await page
    .getByLabel("New password", { exact: true })
    .fill("Fictional-hotel-reset-2026!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Fictional-hotel-reset-2026!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", "/login?next=hotelier");
  expect(page.url()).not.toContain("token=");
  await page.goto("/forgot-password");
  await page
    .getByLabel("Account email", { exact: true })
    .fill("agency-recovery@test.invalid");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("If the account exists");
  expect(request.redirectTo).toBe("/reset-password");
});
