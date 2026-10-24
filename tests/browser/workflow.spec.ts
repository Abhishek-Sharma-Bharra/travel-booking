import { test, expect } from "@playwright/test";
import { db } from "../../src/lib/db";
const suffix = Date.now().toString();
const email = `browser-${suffix}@test.invalid`,
  password = "Demo-test-password-2026!";
const start = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  end = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
test.afterAll(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: `browser-${suffix}` } },
  });
  const agencyIds = [
    ...new Set(users.map((u) => u.agencyId).filter((id): id is string => !!id)),
  ];
  for (const agencyId of agencyIds) {
    await db.activity.deleteMany({ where: { agencyId } });
    await db.transaction.deleteMany({ where: { agencyId } });
    await db.booking.deleteMany({ where: { agencyId } });
    await db.quote.deleteMany({ where: { agencyId } });
    await db.lead.deleteMany({ where: { agencyId } });
    await db.package.deleteMany({ where: { agencyId } });
    await db.spend.deleteMany({ where: { agencyId } });
    await db.user.deleteMany({ where: { agencyId } });
    await db.agency.delete({ where: { id: agencyId } });
  }
  await db.$disconnect();
});
test("demo entry, filters, pipeline, search, printing, exports and read-only writes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore Demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Every journey starts here." }),
  ).toBeVisible();
  await expect(page.getByText("1,500", { exact: true }).last()).toBeVisible();
  await page.screenshot({
    path: "test-results/demo-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Destination filter").selectOption("Bali");
  await expect(page.getByLabel("Destination filter")).toHaveValue("Bali");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page
    .getByRole("button", { name: "Enquiries", exact: false })
    .first()
    .click();
  await page.getByLabel("Search enquiries").fill("VT-0001");
  await expect(
    page.getByRole("button", { name: "Demo Traveller 0001", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Pipeline view").click();
  await expect(page.getByRole("button", { name: /VT-0001/ })).toBeVisible();
  await page.getByLabel("List view").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("enquiries.csv");
  await page
    .getByRole("button", { name: "New enquiry", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Customer name")
    .fill("Unsaved Demo Visitor");
  await page
    .getByRole("dialog")
    .getByLabel("Destination", { exact: false })
    .fill("Bali");
  await page.getByRole("dialog").getByLabel("Travel start").fill(start);
  await page.getByRole("dialog").getByLabel("Travel end").fill(end);
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "read-only",
  );
  await page.getByLabel("Close dialog").click();
  await page.getByRole("button", { name: "Import CSV" }).click();
  const csvHeader =
    "externalId,customer,destination,enquiryDate,travelStart,travelEnd,travellers,budget,quotedPrice,source,assignedId,stage\n";
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csvHeader +
          "IMPORT-INVALID,Sample Traveller,Kerala,2026-02-30,2026-03-10,2026-03-15,2,24000,25000,Website,demo-user-0,New",
      ),
    });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Row 2",
  );
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "valid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csvHeader +
          `IMPORT-PREVIEW,Sample Traveller,Kerala,${fromDate()},${start},${end},2,24000,25000,Website,demo-user-0,New`,
      ),
    });
  await expect(
    page.getByRole("heading", { name: "1 rows · preview (first 10)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import 1 enquiries", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "read-only",
  );
  await page.getByLabel("Close dialog").click();
  await page.getByRole("button", { name: "Quotations", exact: true }).click();
  await page.getByRole("button", { name: "Print / view" }).first().click();
  await expect(page.locator(".print-sheet")).toContainText("Total quotation");
  await page.pdf({
    path: "test-results/quotation.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.getByLabel("Close dialog").click();
  await page
    .getByRole("button", { name: "Monthly report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What the numbers suggest" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Print / save PDF" }).click();
  await expect(page.getByRole("dialog").locator(".print-sheet")).toContainText(
    "Follow-ups completed",
  );
  await page.getByLabel("Close dialog").click();
  await page
    .getByRole("button", { name: "Lead intelligence", exact: true })
    .click();
  await page.getByLabel("Budget fit (budget ÷ quote)").fill("3");
  await expect(
    page.getByText("Not scored: Inputs outside supported model ranges"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Open navigation").click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Every journey starts here." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/demo-mobile.png",
    fullPage: true,
  });
  const anonymous = await page.request.get("/api/data");
  expect(anonymous.status()).toBe(401);
});
test("agency signup, enquiry → quotation → booking → receipt, logout and login", async ({
  page,
}) => {
  await page.goto("/login?signup=1");
  await page.getByLabel("Your name").fill("Browser Test Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace/);
  await page.getByRole("button", { name: "Packages", exact: true }).click();
  await page.getByRole("button", { name: "New package" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Package name").fill("Browser Kerala Escape");
  await dialog.getByLabel("Destination").fill("Kerala");
  await dialog.getByLabel("Selling price").fill("25000");
  await dialog.getByLabel("Estimated supplier").fill("17000");
  await dialog.getByLabel("Inclusions").fill("Hotel and transfers");
  await dialog.getByLabel("Exclusions").fill("Flights");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Browser Kerala Escape" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enquiries", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "New enquiry", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Customer name").fill("Browser Test Traveller");
  await dialog.getByLabel("Destination").fill("Kerala");
  await dialog.getByLabel("Travel start").fill(start);
  await dialog.getByLabel("Travel end").fill(end);
  await dialog.getByLabel("Budget / person").fill("24000");
  await dialog.getByLabel("Quoted price / person").fill("25000");
  await dialog.getByLabel("First response hours").fill("2");
  await dialog.getByLabel("Repeat customer").selectOption("false");
  await dialog.getByLabel("Itinerary requested").selectOption("true");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Browser Test Traveller", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Build quotation", exact: true })
    .last()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Discount").fill("0");
  await dialog.getByLabel("Optional tax").fill("0");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Quotations", exact: true }).click();
  await expect(page.getByText("₹50,000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept & book" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Customer balance due date")
    .fill(start);
  await page.getByRole("button", { name: "Save & create booking" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  await page.getByRole("button", { name: "Record entry" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (₹)").fill("10000");
  await dialog.getByLabel("Reference / reason").fill("Browser partial receipt");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: /₹40,000/ })).toBeVisible();
  await page.getByLabel("Sign out", { exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace/);
});
test("authenticated HTTP tenant isolation, role enforcement, CSRF and disabled access", async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { Origin: "http://localhost:3000" },
  });
  const signed = await owner.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  expect(signed.ok()).toBeTruthy();
  const original = await owner.get("/api/data");
  expect(original.ok()).toBeTruthy();
  const data = await original.json();
  const booking = data.bookings[0];
  const foreignEmail = `browser-${suffix}-foreign@test.invalid`,
    agentEmail = `browser-${suffix}-agent@test.invalid`;
  const foreign = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { Origin: "http://localhost:3000" },
  });
  const signedForeign = await foreign.post("/api/auth/sign-up/email", {
    data: { name: "Foreign test owner", email: foreignEmail, password },
  });
  expect(signedForeign.ok()).toBeTruthy();
  const denied = await foreign.post("/api/action", {
    data: {
      action: "transaction",
      input: {
        agencyId: data.agency.id,
        bookingId: booking.id,
        kind: "Receipt",
        amount: "1",
        memo: "Cross-agency attack",
        date: fromDate(),
      },
    },
  });
  expect(denied.status()).toBe(400);
  expect((await denied.json()).error).toMatch(/not found/);
  const foreignData = await (await foreign.get("/api/data")).json();
  expect(foreignData.leads).toHaveLength(0);
  expect(foreignData.bookings).toHaveLength(0);
  const team = await owner.post("/api/action", {
    data: {
      action: "team-create",
      input: {
        name: "Test Sales Agent",
        email: agentEmail,
        password,
        role: "AGENT",
      },
    },
  });
  expect(team.ok(), await team.text()).toBeTruthy();
  const agent = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { Origin: "http://localhost:3000" },
  });
  expect(
    (
      await agent.post("/api/auth/sign-in/email", {
        data: { email: agentEmail, password },
      })
    ).ok(),
  ).toBeTruthy();
  const agentData = await (await agent.get("/api/data")).json();
  expect(agentData.leads).toHaveLength(0);
  expect(agentData.bookings).toHaveLength(0);
  const forbidden = await agent.post("/api/action", {
    data: {
      action: "settings",
      input: { name: "Hijacked", logo: "", contact: "", footer: "" },
    },
  });
  expect(forbidden.status()).toBe(400);
  expect((await forbidden.json()).error).toMatch(/Only the owner/);
  const csrf = await owner.post("/api/action", {
    headers: { Origin: "https://untrusted.invalid" },
    data: { action: "settings", input: {} },
  });
  expect(csrf.status()).toBe(403);
  const member = await db.user.findUniqueOrThrow({
    where: { email: agentEmail },
  });
  await db.lead.update({
    where: { id: data.leads[0].id },
    data: { assignedId: member.id },
  });
  const assigned = await (await agent.get("/api/data")).json();
  expect(assigned.leads).toHaveLength(1);
  expect(assigned.bookings).toHaveLength(1);
  expect(
    (
      await owner.post("/api/action", {
        data: {
          action: "team",
          input: { id: member.id, role: "AGENT", disabled: true },
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await agent.get("/api/data")).status()).toBe(401);
  await owner.dispose();
  await foreign.dispose();
  await agent.dispose();
});
function fromDate() {
  return new Date().toISOString().slice(0, 10);
}
