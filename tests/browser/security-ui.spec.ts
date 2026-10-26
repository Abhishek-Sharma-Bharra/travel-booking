import { test, expect } from "@playwright/test";
import { db } from "../../src/lib/db";
import { totp } from "../helpers/totp";
const email = `security-browser-${Date.now()}@test.invalid`,
  password = "Fictional-security-browser-password-2026";
test.afterAll(async () => {
  const u = await db.user.findUnique({ where: { email } });
  if (u?.agencyId) {
    await db.activity.deleteMany({ where: { agencyId: u.agencyId } });
    await db.invitation.deleteMany({ where: { agencyId: u.agencyId } });
    await db.user.delete({ where: { id: u.id } });
    await db.agency.delete({ where: { id: u.agencyId } });
  }
  await db.$disconnect();
});
test("password recovery and reset show useful feedback", async ({ page }) => {
  await page.route("**/api/auth/request-password-reset", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"status":true}',
    }),
  );
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Account email").fill("recovery@test.invalid");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator('.info-box[role="status"]')).toContainText(
    "If the account exists",
  );
  await page.route("**/api/auth/reset-password", (r) =>
    r.fulfill({
      status: 400,
      contentType: "application/json",
      body: '{"message":"Reset link is invalid or expired"}',
    }),
  );
  await page.goto("/reset-password?token=fictional-test-token");
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password + "x");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    "do not match",
  );
  await page.getByLabel("Confirm new password").fill(password);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    "invalid or expired",
  );
});
test("security headers, health gating and request size guard", async ({
  request,
  page,
}) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(live.headers()["x-frame-options"]).toBe("DENY");
  expect(live.headers()["referrer-policy"]).toBe("no-referrer");
  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(503);
  expect(await ready.json()).toEqual({ status: "not-ready" });
  const tooBig = await request.post("/api/auth/sign-up/email", {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ name: "x".repeat(70000) }),
  });
  expect(tooBig.status()).toBe(413);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});
test("dialog focus is trapped, Escape closes it and focus returns to the trigger", async ({
  page,
}) => {
  await page.goto("/demo");
  const trigger = page.getByRole("button", {
    name: "New enquiry",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Close dialog")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Save record" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("authenticator enrollment and challenge work in the browser; regular owners cannot administer subscriptions", async ({
  page,
}) => {
  await page.goto("/login?signup=1");
  await page.getByLabel("Your name").fill("Security Browser Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace/);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Confirm your current password").fill(password);
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  const secret = await page
    .getByLabel("Private authenticator setup key")
    .inputValue();
  await page
    .getByLabel("Current six-digit authenticator code")
    .fill(totp(secret));
  await page
    .getByRole("button", { name: "Confirm authenticator setup" })
    .click();
  await expect(
    page.getByText(
      "Two-factor authentication is enabled. Keep your saved recovery codes private.",
      { exact: true },
    ),
  ).toBeVisible();
  const denied = await page.request.post("/api/admin/subscriptions", {
    headers: { Origin: "http://localhost:3000" },
    data: { agencyId: "foreign", plan: "Growth", status: "Active", days: 30 },
  });
  expect(denied.status()).toBe(403);
  await page.getByLabel("Sign out", { exact: true }).click();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/two-factor/);
  await page
    .getByLabel("Authenticator code", { exact: true })
    .fill(totp(secret));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/workspace/);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Invite member", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Email")
    .fill("invite@test.invalid");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save record" })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Email delivery is not configured",
  );
});
