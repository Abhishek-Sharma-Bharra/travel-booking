import { test, expect } from "@playwright/test";
const origin = "http://localhost:3000";
test("Pages -> private Worker -> D1 supports signed signup, enquiry, quotation, booking, payments, reports and logout", async ({
  page,
}) => {
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Skip tour", exact: true })
        .click();
    },
  );
  const email = `d1-browser-${Date.now()}@test.invalid`,
    password = "Fictional-D1-browser-password-2026!";
  await page.goto("/login?signup=1");
  await page.getByLabel("Your name").fill("D1 Browser Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace/);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  const payload = await (await page.request.get("/api/data")).json();
  const act = async (action: string, input: unknown) => {
    const result = await page.request.post("/api/action", {
      headers: { Origin: origin },
      data: { action, input },
    });
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  };
  await act("package", {
    name: "D1 Premium Kerala",
    destination: "Kerala",
    days: 5,
    inclusions: "Hotel and transfer",
    exclusions: "Flights",
    price: "25000",
    estimatedCost: "15000",
  });
  await act("lead", {
    lead: {
      externalId: "D1-1",
      customer: "D1 Traveller",
      email: "",
      phone: "",
      destination: "Kerala",
      enquiryDate: "2026-11-01",
      travelStart: "2026-12-01",
      travelEnd: "2026-12-05",
      travellers: 2,
      budget: "50000",
      quotedPrice: "0",
      source: "Website",
      assignedId: payload.actor.id,
      stage: "New",
    },
  });
  let data = await (await page.request.get("/api/data")).json();
  const quote = await act("quote", {
    leadId: data.leads[0].id,
    packageId: data.packages[0].id,
    discount: "0",
    tax: "0",
  });
  const booking = await act("accept", {
    id: quote.quoteId,
    dueDate: "2026-12-01",
  });
  await act("transaction", {
    bookingId: booking.bookingId,
    requestId: crypto.randomUUID(),
    kind: "Receipt",
    amount: "10000",
    memo: "Fictional transfer",
    date: "2026-11-16",
  });
  data = await (await page.request.get("/api/data")).json();
  expect(data.bookings).toHaveLength(1);
  expect(data.bookings[0].transactions[0].amount).toBe(1000000);
  const report = await page.request.get(
    "/api/analytics?from=2026-11-01&to=2026-11-30",
  );
  expect(report.ok(), await report.text()).toBeTruthy();
  expect(
    (await report.json()).current.find(
      (metric: { key: string }) => metric.key === "receipts",
    ).value,
  ).toBe(1000000);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/d1-workspace-desktop.png",
    fullPage: true,
  });
  for (const endpoint of [
    "/api/messaging",
    "/api/automation",
    "/api/integrations",
  ]) {
    const response = await page.request.get(endpoint);
    expect(response.ok(), `${endpoint}: ${await response.text()}`).toBeTruthy();
  }
  for (const section of [
    "Enquiries",
    "Packages",
    "Quotations",
    "Bookings",
    "Transactions",
    "Marketing",
    "Monthly report",
    "Lead intelligence",
    "Messaging",
    "Automation",
    "Integrations",
    "Subscription",
    "Settings",
    "Overview",
  ]) {
    await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByText(section, { exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: section, exact: true }).first(),
    ).toBeVisible();
  }
  const forbidden = await page.request.post("/api/action", {
    headers: { Origin: "https://untrusted.invalid" },
    data: { action: "settings", input: {} },
  });
  expect(forbidden.status()).toBe(403);
  const signOut = await page.request.post("/api/auth/sign-out", {
    headers: { Origin: origin },
    data: {},
  });
  expect(signOut.ok()).toBeTruthy();
  expect((await page.request.get("/api/data")).status()).toBe(401);
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/d1-workspace-mobile.png",
    fullPage: true,
  });
});
test("D1 fictional demo remains read-only and renders analytics and BI charts", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1,500", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Advanced KPI dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export analytics CSV", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "BI Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Business intelligence reports",
      exact: true,
    }),
  ).toBeVisible();
  const result = await page.request.post("/api/action", {
    headers: { Origin: origin },
    data: { action: "package", input: {} },
  });
  expect(result.status()).toBe(401);
});
