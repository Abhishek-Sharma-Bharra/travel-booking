import { test, expect, type Page } from "@playwright/test";
const origin = "http://localhost:3000";
async function signup(page: Page) {
  const ip = "198.51.100." + (30 + Math.floor(Math.random() * 180));
  await page
    .context()
    .setExtraHTTPHeaders({ "CF-Connecting-IP": ip, "X-Forwarded-For": ip });
  const r = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: {
      name: "Supplier Test Owner",
      email: `suppliers-${Date.now()}-${Math.random().toString(16).slice(2)}@test.invalid`,
      password: "Fictional-Supplier-2026!",
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}
test("supplier contracts persist exact rates and immutable versions; a lost acknowledgement safely replays one create", async ({
  page,
  browser,
}) => {
  const guest = await browser.newContext();
  try {
    expect((await guest.request.get(origin + "/api/suppliers")).status()).toBe(
      401,
    );
  } finally {
    await guest.close();
  }
  await signup(page);
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
  ).toBeHidden();
  const before = await (await page.request.get("/api/data")).json();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name: "Suppliers", exact: true })
    .click();
  const section = page.getByRole("region", {
    name: "Private supplier directory",
  });
  await section
    .getByRole("button", { name: "Add supplier", exact: true })
    .click();
  await section
    .getByLabel("Supplier name", { exact: true })
    .fill("Fictional Delhi Hotel");
  await section.getByLabel("Supplier city", { exact: true }).fill("Delhi");
  await section
    .getByLabel("Supplier email", { exact: true })
    .fill("supplier@test.invalid");
  await section
    .getByLabel("Contract reference", { exact: true })
    .fill("Fictional-2026");
  await section
    .getByRole("combobox", { name: "Contract status", exact: true })
    .selectOption("RECORDED");
  await section
    .getByLabel("Contract valid from", { exact: true })
    .fill("2026-11-27");
  await section
    .getByLabel("Contract valid until", { exact: true })
    .fill("2027-03-31");
  await section
    .getByLabel("Negotiated rate (INR, optional)", { exact: true })
    .fill("1500.25");
  await section
    .getByLabel("Payment terms", { exact: true })
    .fill("Payment under written agreement");
  await section
    .getByLabel("Cancellation terms", { exact: true })
    .fill("Review supplier cancellation policy");
  let first = true;
  const keys: string[] = [];
  await page.route("**/api/suppliers", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().requestId);
    if (first) {
      first = false;
      const r = await route.fetch();
      expect(r.ok(), await r.text()).toBeTruthy();
      return route.fulfill({
        status: 503,
        json: {
          error:
            "Fictional lost acknowledgement after the supplier record was committed",
        },
      });
    }
    return route.continue();
  });
  await section
    .getByRole("button", { name: "Save supplier profile", exact: true })
    .click();
  await expect(section.getByRole("alert")).toContainText(
    "lost acknowledgement",
  );
  await expect(
    section.getByLabel("Supplier name", { exact: true }),
  ).toBeDisabled();
  await section
    .getByRole("button", { name: "Retry same supplier request", exact: true })
    .click();
  await expect(section.getByRole("status")).toContainText("revision 0");
  expect(keys[0]).toBe(keys[1]);
  const r = await page.request.get("/api/suppliers");
  expect(r.headers()["cache-control"]).toContain("no-store");
  const list = await r.json();
  expect(list.suppliers).toHaveLength(1);
  const id = list.suppliers[0].id;
  await section
    .getByRole("button", { name: "Open last saved supplier", exact: true })
    .click();
  await expect(
    section.getByLabel("Negotiated rate (INR, optional)", { exact: true }),
  ).toHaveValue("1500.25");
  await section
    .getByLabel("Negotiated rate (INR, optional)", { exact: true })
    .fill("2000");
  await section
    .getByRole("button", { name: "Save supplier profile", exact: true })
    .click();
  await expect(section.getByRole("status")).toContainText("revision 1");
  await section
    .getByRole("button", { name: "Open last saved supplier", exact: true })
    .click();
  await section
    .getByRole("combobox", { name: "Contract/profile version", exact: true })
    .selectOption("0");
  await expect(
    section.getByLabel("Negotiated rate (INR, optional)", { exact: true }),
  ).toHaveValue("1500.25");
  await expect(
    section.getByRole("button", { name: "Save supplier profile", exact: true }),
  ).toBeDisabled();
  const doc = await (await page.request.get("/api/suppliers?id=" + id)).json();
  expect(doc.supplier.profile.contract.ratePaise).toBe(200000);
  expect(doc.versions).toHaveLength(2);
  const forbidden = await page.request.post("/api/suppliers", {
    headers: { Origin: "https://foreign.example" },
    data: {},
  });
  expect(forbidden.status()).toBe(403);
  const elsewhere = await browser.newContext();
  try {
    const p = await elsewhere.newPage();
    await signup(p);
    expect(
      (await p.request.get(origin + "/api/suppliers?id=" + id)).status(),
    ).toBe(404);
  } finally {
    await elsewhere.close();
  }
  const after = await (await page.request.get("/api/data")).json();
  expect(after.agency.plan).toBe(before.agency.plan);
  expect(after.bookings).toEqual(before.bookings);
  expect(after.leads).toEqual(before.leads);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = await page.locator(".sidebar").boundingBox();
      return b ? b.x + b.width : 0;
    })
    .toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/suppliers-mobile.png",
    fullPage: true,
  });
});

test("owners can choose server-side automatic assignment for a new enquiry", async ({
  page,
}) => {
  await signup(page);
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Available workspace tools" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New enquiry", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New enquiry", exact: true });
  await dialog
    .getByLabel(/^Customer name/)
    .fill("Automatic Assignment Traveller");
  await dialog.getByLabel(/^Destination/).fill("Delhi");
  await dialog.getByLabel(/^Travel start/).fill("2026-12-10");
  await dialog.getByLabel(/^Travel end/).fill("2026-12-12");
  await dialog.getByLabel(/^Assigned to/).selectOption("__AUTO_LOWEST_OPEN__");
  await dialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const data = await (await page.request.get("/api/data")).json();
  expect(data.leads).toHaveLength(1);
  expect(data.leads[0].assignedId).toBe(data.actor.id);
  expect(data.leads[0].assignedId).not.toBe("__AUTO_LOWEST_OPEN__");
  await expect(
    page.getByRole("button", { name: "CRM review centre", exact: true }),
  ).toBeVisible();
});
