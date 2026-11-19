import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
function localSql(sql: string) {
  return execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "TRAVELOS_DB",
      "--local",
      "--config",
      "cloudflare/worker/wrangler.jsonc",
      "--persist-to",
      ".local/cloudflare-state",
      "--command",
      sql,
      "--json",
    ],
    {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: "/workspace/.config",
        WRANGLER_LOG_PATH: ".local/cloudflare-logs",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}
let clientAddressCounter = 20 + (Date.now() % 200);
async function account(page: Page, email: string, admin = false) {
  const address = "198.51.100." + ((++clientAddressCounter % 250) + 1);
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": address,
    "CF-Connecting-IP": address,
  });
  // LOCAL-only fixture reset before replaying this UI test. Actual MFA and
  // session permission checks are exercised in the server security suites.
  if (admin)
    localSql(
      `UPDATE "User" SET "twoFactorEnabled"=0 WHERE email='marketplace-admin@test.invalid'`,
    );
  const headers = { Origin: "http://localhost:3000" },
    password = "Fictional-marketplace-browser-2026!";
  let r = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Fictional Test Account", email, password },
  });
  if (!r.ok())
    r = await page.request.post("/api/auth/sign-in/email", {
      headers,
      data: { email, password },
    });
  expect(r.ok(), await r.text()).toBeTruthy();
  const user = (await r.json()).user;
  expect(user.id).toMatch(/^[\w-]+$/);
  localSql(
    `UPDATE "User" SET "emailVerified"=1${admin ? ',"twoFactorEnabled"=1' : ""} WHERE id='${user.id}'`,
  );
  if (admin)
    localSql(
      `UPDATE "Session" SET "mfaVerifiedAt"=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE "userId"='${user.id}'`,
    );
  return user;
}
test("one homepage presents all business services and proposed pricing on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    for (const heading of [
      "Travel Agency CRM",
      "Hotel Management & Booking",
      "Bus Operator Management & Booking",
      "Car Rental",
      "AI Booking Assistant",
      "A plan for your business.",
    ])
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Register bus operator", exact: true }),
    ).toHaveAttribute("href", "/login?signup=1&next=operator");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/unified-marketplace-${width}.png`,
      fullPage: true,
    });
  }
});
test("operator business registration, independent admin review, charter request and supplier confirmation work on Pages → Worker → D1", async ({
  page,
  browser,
}) => {
  const stamp = Date.now(),
    name = "Fictional Bus Company " + stamp;
  const owner = await account(page, `operator-${stamp}@test.invalid`);
  await page.goto("/operator");
  await page.getByLabel("Business name", { exact: true }).fill(name);
  await page.getByLabel("City", { exact: true }).fill("Manali");
  await page
    .getByLabel("Business address", { exact: true })
    .fill("123 Fictional Charter Operations Road");
  await page
    .getByLabel("Business phone with country code", { exact: true })
    .fill("+919876543210");
  await page
    .getByLabel("Business email", { exact: true })
    .fill("operator@test.invalid");
  await page
    .getByLabel("Business registration / verification reference", {
      exact: true,
    })
    .fill("FICTIONAL-LOCAL-REG");
  await page
    .getByRole("button", { name: "Save business draft", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Accept the displayed commercial agreement" })
    .click();
  await expect(page.getByText(/Accepted on/)).toBeVisible();
  await page
    .getByRole("button", { name: "Submit business for verification" })
    .click();
  await expect(
    page.getByText("BUS · PENDING · Manali", { exact: true }),
  ).toBeVisible();
  const adminContext = await browser.newContext(),
    admin = await adminContext.newPage();
  await account(admin, "marketplace-admin@test.invalid", true);
  await admin.goto("/admin/marketplace");
  await expect(
    admin.getByRole("heading", { name: "Marketplace overview", exact: true }),
  ).toBeVisible();
  const details = admin
    .locator("details")
    .filter({ has: admin.locator("summary", { hasText: name }) })
    .first();
  await details.locator(":scope > summary").click();
  await details
    .getByLabel("Review evidence / reason", { exact: true })
    .fill("Fictional independently verified local business evidence");
  await details
    .getByLabel("I independently verified this business and owner.")
    .check();
  await details
    .getByRole("button", { name: "Record review", exact: true })
    .click();
  await expect(
    admin.locator("summary").filter({ hasText: name }),
  ).toContainText("APPROVED");
  await admin.screenshot({
    path: "test-results/marketplace-admin.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByLabel("Vehicle name", { exact: true })
    .fill("Fictional 35 Seat Coach");
  await page
    .getByLabel("Registration number", { exact: true })
    .fill("TEST-" + stamp);
  await page.getByLabel("Capacity", { exact: true }).fill("35");
  await page.getByLabel("Rate in ₹", { exact: true }).fill("12000");
  await page.getByLabel("Applicable tax %", { exact: true }).fill("5");
  await page
    .getByLabel("Inclusions, cancellation and payment terms", { exact: true })
    .fill(
      "Full bus charter. Pay the supplier directly. Tolls excluded. Cancellation requires review.",
    );
  await page.getByRole("button", { name: "Add vehicle", exact: true }).click();
  await expect(
    page.getByText("Fictional 35 Seat Coach", { exact: true }).first(),
  ).toBeVisible();
  const buyerContext = await browser.newContext(),
    buyer = await buyerContext.newPage();
  await account(buyer, `buyer-${stamp}@test.invalid`);
  await buyer.goto("/marketplace");
  const start = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    end = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await buyer.getByLabel(/^Service/).selectOption("BUS");
  await buyer.getByLabel("Destination / city", { exact: true }).fill("Manali");
  await buyer.getByLabel("Start / check-in", { exact: true }).fill(start);
  await buyer
    .getByLabel("End / check-out (exclusive)", { exact: true })
    .fill(end);
  await buyer
    .getByRole("button", { name: "Search partners", exact: true })
    .click();
  const supplier = buyer
    .locator("article")
    .filter({ has: buyer.getByRole("heading", { name, exact: true }) });
  await supplier
    .getByRole("button", { name: "Choose vehicle", exact: true })
    .click();
  await buyer
    .getByLabel("Route / travel purpose", { exact: true })
    .fill("Delhi to Manali private group charter");
  await buyer.getByLabel("Group size", { exact: true }).fill("30");
  await buyer.getByLabel(/^Booking channel/).selectOption("MARKETPLACE");
  await buyer
    .getByRole("button", { name: "Get verified quote", exact: true })
    .click();
  await expect(
    buyer.getByRole("heading", { name: "Review your quote", exact: true }),
  ).toBeVisible();
  await buyer
    .getByLabel("Customer name", { exact: true })
    .fill("Fictional Charter Guest " + stamp);
  await buyer
    .getByLabel("Customer phone with country code", { exact: true })
    .fill("+919876543211");
  await buyer.getByLabel(/I am authorized to share/).check();
  await buyer
    .getByRole("button", { name: "Send booking request", exact: true })
    .click();
  await expect(buyer.getByRole("status")).toContainText("Request saved");
  await page.reload();
  const booking = page
    .getByRole("row")
    .filter({ hasText: "Fictional Charter Guest " + stamp });
  await expect(booking).toContainText("REQUESTED");
  await booking
    .getByRole("button", { name: "Hold inventory", exact: true })
    .click();
  await expect(booking).toContainText("HELD");
  await booking
    .getByRole("button", { name: "Confirm booking", exact: true })
    .click();
  await expect(booking).toContainText("CONFIRMED");
  await expect(booking).toContainText("UNPAID");
  await page
    .getByLabel("Calendar month", { exact: true })
    .fill(start.slice(0, 7));
  await page
    .getByRole("button", { name: "View availability calendar", exact: true })
    .click();
  await expect(
    page.locator(".market-calendar .confirmed").first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/operator-charter-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/operator-charter-mobile.png",
    fullPage: true,
  });
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Report from", { exact: true }).fill(from);
  await page.getByLabel("Report until (exclusive)", { exact: true }).fill(to);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("travelos-bookings");
  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  await account(outsiderPage, `outsider-${stamp}@test.invalid`);
  const records = await (
    await outsiderPage.request.get("/api/marketplace")
  ).json();
  expect(records.bookings).toHaveLength(0);
  await outsider.close();
  await buyerContext.close();
  await adminContext.close();
  expect(owner.id).toBeTruthy();
});
