import { test, expect } from "@playwright/test";
import { db } from "../../src/lib/db";
const email = "tour-browser-" + Date.now() + "@test.invalid";
test.afterAll(async () => {
  const u = await db.user.findUnique({ where: { email } });
  if (u?.agencyId) {
    await db.activity.deleteMany({ where: { agencyId: u.agencyId } });
    await db.user.delete({ where: { id: u.id } });
    await db.agency.delete({ where: { id: u.agencyId } });
  }
  await db.$disconnect();
});
test("first login tour uses real screens, persists skip and completion, restarts and works on mobile", async ({
  page,
}) => {
  await page.goto("/login?signup=1");
  await page.getByLabel("Your name").fill("Tour owner");
  await page.getByLabel("Work email").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-tour-password-2026!");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Workspace tour",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("OWNER");
  const spotlight = page.locator(".tour-spotlight");
  await expect(spotlight).toBeVisible();
  const headingBox = await page
    .locator('[data-tour-page="Overview"]')
    .boundingBox();
  const spotlightBox = await spotlight.boundingBox();
  const cardBox = await dialog.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(spotlightBox!.x).toBeLessThanOrEqual(headingBox!.x);
  expect(spotlightBox!.y).toBeLessThanOrEqual(headingBox!.y);
  expect(spotlightBox!.x + spotlightBox!.width).toBeGreaterThanOrEqual(
    headingBox!.x + headingBox!.width - 1,
  );
  expect(cardBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height);
  expect(cardBox!.width).toBeLessThanOrEqual(340);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );

  await dialog.getByRole("button", { name: "Next step" }).click();
  await expect(page.locator('[data-tour-page="Enquiries"]')).toBeVisible();
  await expect(dialog).toContainText("Keep every enquiry moving");
  await expect(page.locator("[data-tour-page=Enquiries]")).toHaveClass(
    /tour-highlight/,
  );
  await page.screenshot({ path: "test-results/tour-desktop.png" });
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator('[data-tour-page="Overview"]')).toBeVisible();
  await dialog.getByRole("button", { name: "Skip tour" }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Every journey starts here." }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Take a Tour", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("[data-tour-page=Overview]")).toHaveClass(
    /tour-highlight/,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => Math.abs(window.scrollX)),
  ).toBeLessThanOrEqual(1);
  const mobileCard = await dialog.boundingBox();
  expect(mobileCard!.x).toBeGreaterThanOrEqual(0);
  expect(mobileCard!.x + mobileCard!.width).toBeLessThanOrEqual(390);
  expect(mobileCard!.y + mobileCard!.height).toBeLessThanOrEqual(845);
  await page.screenshot({ path: "test-results/tour-mobile.png" });
  for (let i = 0; i < 9; i++) {
    await dialog.getByRole("button", { name: "Next step" }).click();
  }
  await expect(dialog).toContainText("Manage agency access");
  await dialog.getByRole("button", { name: "Finish tour" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Take a Tour", exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  // A slow onboarding read must not steal navigation after the user chose a screen.
  await page.route("**/api/tour", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      json: { version: 1, role: "OWNER", progress: null },
    });
  });
  const delayed = page.waitForResponse(
    (r) => r.url().endsWith("/api/tour") && r.request().method() === "GET",
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.reload();
  await page.getByRole("button", { name: "Packages", exact: true }).click();
  await delayed;
  await expect(page.locator('[data-tour-page="Packages"]')).toBeVisible();
  await expect(dialog).toBeHidden();
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  expect(
    (await db.tourProgress.findUniqueOrThrow({ where: { userId: u.id } }))
      .status,
  ).toBe("COMPLETE");
});
test("demo tour is manual and never mutates server state", async ({ page }) => {
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/tour") && r.method() === "POST") posts++;
  });
  await page.goto("/demo");
  await expect(
    page.getByRole("dialog", { name: "Workspace tour" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Take a Tour", exact: true }).click();
  await page.getByRole("button", { name: "Skip tour" }).click();
  expect(posts).toBe(0);
});
