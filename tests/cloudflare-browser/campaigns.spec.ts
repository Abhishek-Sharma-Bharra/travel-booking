import { test, expect } from "@playwright/test";
test("an agency publishes an ad link and an anonymous traveller chats and saves one CRM booking request", async ({
  page,
  browser,
}) => {
  const origin = "http://localhost:3000",
    email = `campaign-ui-${Date.now()}@test.invalid`;
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: {
      name: "Campaign Test Agency",
      email,
      password: "Fictional-Campaign-Password-2026!",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const pkg = await page.request.post("/api/action", {
    headers: { Origin: origin },
    data: {
      action: "package",
      input: {
        name: "Kerala Explorer",
        destination: "Kerala",
        days: 5,
        inclusions: "Breakfast and airport transfers",
        exclusions: "Flights",
        itinerary:
          "Day 1 arrival. Day 2 hills. Day 3 backwaters. Day 4 leisure. Day 5 departure.",
        paymentTerms: "Agency checks availability before requesting payment.",
        cancellationTerms:
          "Written agency approval required. No refund promised.",
        rateNotes:
          "Same published rate per traveller; concessions require review.",
        price: "12500",
        estimatedCost: "8000",
      },
    },
  });
  expect(pkg.ok(), await pkg.text()).toBeTruthy();
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Skip tour", exact: true })
        .click();
    },
  );
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Ad campaigns", exact: true }).click();
  await page.getByLabel("Campaign title").fill("A slower escape to Kerala");
  await page.getByRole("checkbox", { name: /Kerala Explorer/ }).check();
  await page.getByLabel(/Tax added/).fill("5");
  await page
    .getByLabel(/Rates valid through/)
    .fill(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  await page
    .getByRole("checkbox", { name: /I approve these packages/ })
    .check();
  await page
    .getByRole("button", { name: "Publish campaign link", exact: true })
    .click();
  const link = page.getByRole("link", { name: /Open customer page/ }).first();
  await expect(link).toBeVisible();
  const url = (await link.getAttribute("href"))!;
  const publicContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const customer = await publicContext.newPage();
  await customer.goto(url + "?utm_source=meta&utm_campaign=kerala-test");
  await expect(
    customer.getByRole("heading", {
      name: "A slower escape to Kerala",
      exact: true,
    }),
  ).toBeVisible();
  await customer
    .getByRole("button", { name: "Total price", exact: true })
    .click();
  await expect(
    customer.getByText(/travellers ka published total: ₹26,250/),
  ).toBeVisible();
  await customer.screenshot({
    path: "test-results/campaign-customer-desktop.png",
    fullPage: true,
  });
  await customer
    .getByLabel(/Preferred departure/)
    .fill(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  await customer
    .getByLabel("Your name", { exact: true })
    .fill("Fictional Traveller");
  await customer.getByLabel("Phone with country code").fill("+919876543210");
  await customer
    .getByRole("checkbox", { name: /I agree to the published package terms/ })
    .check();
  await customer
    .getByRole("button", { name: "Send booking request", exact: true })
    .click();
  await expect(
    customer.getByRole("heading", { name: "Request received", exact: true }),
  ).toBeVisible();
  await expect(
    customer.getByText(/This is not a confirmed booking/),
  ).toBeVisible();
  const data = await (await page.request.get("/api/data")).json();
  expect(data.leads).toHaveLength(1);
  expect(data.quotes).toHaveLength(1);
  expect(data.bookings).toHaveLength(0);
  expect(data.quotes[0].total).toBe(2625000);
  expect(data.leads[0].notes).toContain("kerala-test");
  const forbidden = await customer.request.post(
    new URL(url).pathname.replace("/trips/", "/api/public/trips/"),
    {
      headers: { Origin: "https://untrusted.invalid" },
      data: { action: "request", input: {} },
    },
  );
  expect(forbidden.status()).toBe(403);
  await customer.setViewportSize({ width: 390, height: 844 });
  expect(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await customer.screenshot({
    path: "test-results/campaign-customer-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Ad campaigns", exact: true }).click();
  await expect(page.getByText(/1 booking requests/)).toBeVisible();
  await page.getByRole("button", { name: "Pause link", exact: true }).click();
  await expect(page.getByText(/Paused \/ expired/)).toBeVisible();
  await customer.goto(url);
  // Next may have already streamed HTTP 200 before notFound(); verify the
  // unavailable UI and the non-streaming API's authorization boundary.
  await expect(
    customer.getByRole("heading", { name: "404", exact: true }),
  ).toBeVisible();
  const paused = await customer.request.post(
    new URL(url).pathname.replace("/trips/", "/api/public/trips/"),
    {
      headers: { Origin: origin },
      data: {
        action: "chat",
        input: {
          message: "price",
          language: "English",
          packageId: null,
          aiConsent: false,
        },
      },
    },
  );
  expect(paused.status()).toBe(404);
  await publicContext.close();
});
