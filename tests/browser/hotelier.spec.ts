import { test, expect } from "./fixtures";
import { db } from "../../src/lib/db";
import { randomUUID } from "node:crypto";
const prefix = "hotel-browser-" + randomUUID();
test.afterAll(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: prefix } },
  });
  for (const u of users) {
    await db.hotel.deleteMany({
      where: { members: { some: { userId: u.id, role: "OWNER" } } },
    });
    await db.activity.deleteMany({ where: { actor: u.id } });
    await db.user.delete({ where: { id: u.id } });
    if (u.agencyId)
      await db.agency.deleteMany({
        where: { id: u.agencyId, users: { none: {} } },
      });
  }
  await db.$disconnect();
});
test("hotel owner verifies account, registers draft, adds category, submits review and cannot approve or cross hotel boundaries", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.HOTELS_ENABLED !== "true",
    "Hotel foundation is feature-gated; enable only in local/staging test server",
  );
  await page
    .context()
    .setExtraHTTPHeaders({ "x-forwarded-for": "192.0.2.170" });
  expect((await request.get("/api/hotelier")).status()).toBe(401);
  await page.goto("/login?signup=1&next=hotelier");
  await page.getByLabel("Your name").fill("Hotel fixture owner");
  await page.getByLabel("Work email").fill(prefix + "@test.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-hotel-password-2026!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verify your email first" }),
  ).toBeVisible();
  expect((await page.request.get("/api/hotelier")).status()).toBe(403);
  const user = await db.user.findUniqueOrThrow({
    where: { email: prefix + "@test.invalid" },
  });
  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Hotel owner workspace" }),
  ).toBeVisible();
  await expect(page.locator(".hotel-welcome-photo figcaption")).toContainText(
    "not a listed property",
  );
  await expect
    .poll(() =>
      page
        .locator(".hotel-welcome-photo img")
        .evaluate(
          (img) =>
            (img as HTMLImageElement).complete &&
            (img as HTMLImageElement).naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page
    .getByLabel("Hotel name", { exact: true })
    .fill("Fictional Mountain Hotel");
  await page.getByLabel("City / destination").fill("Manali");
  await page.getByLabel("State / region").fill("Himachal Pradesh");
  await page.getByLabel("Postal code").fill("175131");
  await page.getByLabel("Hotel international phone").fill("+919876543210");
  await page.getByLabel("Full address").fill("123 Fictional Test Road, Manali");
  await page
    .getByLabel("Hotel policies", { exact: true })
    .fill("Check-in terms recorded by hotel staff for this test only.");
  await page
    .getByLabel("Cancellation policy", { exact: true })
    .fill("Cancellation terms require business review before publication.");
  await page
    .getByRole("button", { name: "Create hotel draft", exact: true })
    .click();
  await expect(page.locator(".hotel-section-header")).toContainText("DRAFT");
  await page
    .getByRole("button", { name: "Room categories", exact: true })
    .click();
  await page.getByLabel("Room category name", { exact: true }).fill("Deluxe");
  await page.getByLabel("Declared room count").fill("3");
  await page.getByLabel("Maximum children").fill("1");
  await page.getByLabel("Maximum combined guests").fill("3");
  await page
    .getByRole("button", { name: "Save room category", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Deluxe", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit for verification", exact: true })
    .click();
  await expect(page.locator(".hotel-section-header")).toContainText("PENDING");
  expect((await page.request.get("/api/admin/hotels")).status()).toBe(403);
  const foreign = await db.user.create({
    data: {
      id: prefix + "-foreign",
      name: "Other owner",
      email: prefix + "-foreign@test.invalid",
      emailVerified: true,
    },
  });
  const hotel = await db.hotel.create({
    data: {
      name: "Foreign hotel",
      taxBps: 0,
      members: { create: { userId: foreign.id, role: "OWNER" } },
    },
  });
  const response = await page.request.post("/api/hotelier", {
    headers: { origin: "http://localhost:3000" },
    data: { action: "submit", hotelId: hotel.id, revision: 0 },
  });
  expect(response.status()).toBe(404);
  expect(
    (
      await page.request.post("/api/hotelier", {
        headers: { origin: "https://attacker.invalid" },
        data: { action: "submit", hotelId: hotel.id, revision: 0 },
      })
    ).status(),
  ).toBe(403);
  const own = await page.request.get("/api/hotelier");
  expect(JSON.stringify(await own.json())).not.toContain("Foreign hotel");
  await page
    .getByRole("button", { name: "Audit history", exact: true })
    .click();
  await expect(page.locator(".hotel-content")).toContainText("SUBMITTED");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/hotel-owner-mobile.png",
    fullPage: true,
  });
});
