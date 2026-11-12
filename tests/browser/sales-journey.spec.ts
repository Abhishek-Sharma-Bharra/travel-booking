import { test, expect } from "./fixtures";
import { db } from "../../src/lib/db";
const key = "journey-" + Date.now(),
  email = key + "@test.invalid";
test.afterAll(async () => {
  const u = await db.user.findUnique({ where: { email } });
  if (u?.agencyId) {
    const agencyId = u.agencyId;
    for (const model of [
      db.activity,
      db.transaction,
      db.booking,
      db.quote,
      db.lead,
      db.package,
      db.spend,
      db.user,
    ] as any[])
      await model.deleteMany({ where: { agencyId } });
    await db.agency.delete({ where: { id: agencyId } });
  }
  await db.$disconnect();
});
test("historical enquiry journeys keep quotes and bookings visible, guide missing packages, and avoid duplicate booking actions", async ({
  page,
}) => {
  const start = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    end = new Date(Date.now() + 65 * 86400000).toISOString().slice(0, 10);
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      name: "Journey Owner",
      email,
      password: "Fictional-journey-password-2026!",
    },
  });
  expect(signup.ok()).toBeTruthy();
  const data = await (await page.request.get("/api/data")).json();
  const act = async (action: string, input: unknown) => {
    const r = await page.request.post("/api/action", {
      headers: { Origin: "http://localhost:3000" },
      data: { action, input },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  };
  await act("lead", {
    lead: {
      externalId: key,
      customer: "Journey Traveller",
      destination: "Kerala",
      enquiryDate: "2020-01-15",
      travelStart: start,
      travelEnd: end,
      travellers: 2,
      budget: "25000",
      quotedPrice: "0",
      source: "Website",
      assignedId: data.actor.id,
      stage: "New",
    },
  });
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Enquiries", exact: false })
    .first()
    .click();
  await page.getByLabel("From date").fill("2020-01-01");
  await page.getByLabel("To date").fill("2020-12-31");
  await page
    .getByRole("button", { name: "Journey Traveller", exact: true })
    .click();
  await expect(page.getByLabel("Enquiry to booking")).toContainText(
    "Not booked",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Build quotation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Packages", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Add a package");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await act("package", {
    name: "Journey Kerala",
    destination: "Kerala",
    days: "5",
    price: "25000",
    estimatedCost: "15000",
    inclusions: "Hotel",
    exclusions: "Flight",
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Enquiries", exact: false })
    .first()
    .click();
  await page.getByLabel("From date").fill("2020-01-01");
  await page.getByLabel("To date").fill("2020-12-31");
  await page
    .getByRole("button", { name: "Journey Traveller", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Build quotation", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("Discount").fill("0");
  await page.getByRole("dialog").getByLabel("Optional tax").fill("0");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Quotations", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Enquiry focus")).toContainText(
    "Journey Traveller",
  );
  await expect(page.getByLabel("From date")).toHaveCount(0);
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
  const previousTitle = await page.title();
  await page.getByRole("button", { name: "Print / view", exact: true }).click();
  const preview = page.getByRole("dialog");
  await expect(preview).toContainText("Version 1 · Draft");
  await expect(preview).toContainText("not a payment receipt or tax invoice");
  await expect(page).toHaveTitle(/^Quotation-.+-v1$/);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await preview.getByRole("button", { name: "Copy customer message" }).click();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain("Hello Journey Traveller");
  expect(message).toContain("₹50,000");
  expect(message).not.toContain("15000"); // Internal supplier costs must stay private.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".quotation-help")).toBeHidden();
  await expect(preview.locator(".print-sheet")).toBeVisible();
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await page.emulateMedia({ media: "screen" });
  await preview
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(page).toHaveTitle(previousTitle);

  await page
    .getByRole("button", { name: "Build quotation", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save record" })
    .click();
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Version 1", { exact: true }) })
    .getByRole("button", { name: "Accept & book", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Customer balance due date")
    .fill(start);
  await page
    .getByRole("button", { name: "Save & create booking", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bookings", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Enquiry focus")).toContainText(
    "Journey Traveller",
  );
  await expect(
    page.getByRole("button", { name: "Journey Traveller", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to filtered list" }).click();
  await expect(page.getByLabel("From date")).toHaveValue("2020-01-01");
  await expect(page.getByLabel("To date")).toHaveValue("2020-12-31");
  await expect(
    page.getByRole("button", { name: "Journey Traveller", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Enquiries", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Journey Traveller", exact: true })
    .click();
  await expect(page.getByLabel("Enquiry to booking")).toContainText(
    "Confirmed",
  );
  await page.screenshot({ path: "test-results/sales-journey-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/sales-journey-mobile.png" });
  await page
    .getByRole("button", { name: "View enquiry quotations", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept & book", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("This enquiry already has a booking.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open booking", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Record entry", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Amount (₹)").fill("10000");
  await page
    .getByRole("dialog")
    .getByLabel("Reference / reason")
    .fill("Journey receipt");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("cell", { name: /₹40,000/ })).toBeVisible();
  const saved = await (await page.request.get("/api/data")).json();
  expect(saved.bookings).toHaveLength(1);
  expect(saved.quotes).toHaveLength(2);
  expect(saved.bookings[0].transactions).toHaveLength(1);
});
