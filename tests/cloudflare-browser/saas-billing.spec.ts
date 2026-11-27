import { test, expect } from "@playwright/test";
test("sandbox billing defaults off, protects its APIs and never trusts browser payment success for real access", async ({
  page,
  browser,
}) => {
  const origin = "http://localhost:3000";
  await expect
    .poll(
      async () => {
        try {
          return (await (await page.request.get("/api/health/live")).json())
            .status;
        } catch {
          return "waiting";
        }
      },
      { timeout: 30000 },
    )
    .toBe("up");
  const address = "203.0.113." + (30 + Math.floor(Math.random() * 180));
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": address,
    "CF-Connecting-IP": address,
  });
  await page.goto("/login?signup=1");
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Fictional Billing Owner");
  await page
    .getByLabel("Work email", { exact: true })
    .fill(`billing-${Date.now()}@test.invalid`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-billing-test-password-2026!");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace$/);
  // Finish first-run onboarding before navigating: its async read can otherwise
  // start the Overview walkthrough while this test clicks Subscription.
  await expect(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
  ).toBeHidden();
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  await nav.getByRole("button", { name: "Subscription", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your subscription", exact: true }),
  ).toBeVisible();
  const actual = await page.request.get("/api/billing/sandbox");
  expect(actual.status()).toBe(200);
  expect((await actual.json()).enabled).toBe(false);
  expect(actual.headers()["cache-control"]).toContain("no-store");
  await expect(
    page.getByRole("region", { name: "Sandbox subscription billing" }),
  ).toHaveCount(0);
  const before = await (await page.request.get("/api/data")).json();
  const forbidden = await page.request.post("/api/billing/sandbox", {
    headers: { Origin: "https://not-our-site.example" },
    data: { action: "CREATE", input: {} },
  });
  expect(forbidden.status()).toBe(403);
  const blocked = await page.request.post("/api/billing/sandbox", {
    headers: { Origin: origin },
    data: {
      action: "CREATE",
      input: {
        requestId: crypto.randomUUID(),
        planCode: "fixture",
        quoteHash: "0".repeat(64),
        acceptedTestTerms: true,
      },
    },
  });
  expect(blocked.status()).toBe(503);
  const guest = await browser.newContext();
  try {
    expect(
      (await guest.request.get(origin + "/api/billing/sandbox")).status(),
    ).toBe(401);
  } finally {
    await guest.close();
  }
  // UI-only mocked provider return deliberately has no trusted server webhook.
  // A successful hosted-checkout callback must not activate the actual tenant.
  let posts = 0;
  const requestKeys: string[] = [];
  const plan = {
    code: "fixture",
    label: "Fictional sandbox monthly",
    appPlan: "Starter",
    amountPaise: 10000,
    currency: "INR",
    period: "monthly",
    totalCycles: 12,
    termsVersion: "fixture-v1",
    taxLabel: "Fictional all-in test total",
    cancellationTerms: "Test exercise only; no real service purchase",
    quoteHash: "a".repeat(64),
  };
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.Razorpay=class{constructor(options){this.options=options;}open(){window.__sandboxOpened=(window.__sandboxOpened||0)+1;this.options.handler({razorpay_payment_id:"pay_untrusted_browser"});}};',
    }),
  );
  await page.route("**/api/billing/sandbox", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          enabled: true,
          reason: "Sandbox exercise only",
          plans: [plan],
          checkouts: [],
          receipts: [],
        },
      });
    posts++;
    const body = route.request().postDataJSON();
    requestKeys.push(body.input.requestId);
    expect(body.action).toBe("CREATE");
    expect(body.input.acceptedTestTerms).toBe(true);
    expect(body.input.quoteHash).toBe(plan.quoteHash);
    expect(body.input.requestId).toMatch(/^[a-f0-9-]{36}$/);
    return route.fulfill({
      json: {
        checkoutId: crypto.randomUUID(),
        state: "READY",
        subscriptionId: "sub_fixture",
        keyId: posts === 1 ? "rzp_live_unexpected" : "rzp_test_fixture",
        amountPaise: 10000,
        currency: "INR",
        testMode: true,
      },
    });
  });
  await nav.getByRole("button", { name: "Overview", exact: true }).click();
  await nav.getByRole("button", { name: "Subscription", exact: true }).click();
  const sandbox = page.getByRole("region", {
    name: "Sandbox subscription billing",
    exact: true,
  });
  await expect(sandbox).toBeVisible();
  await sandbox
    .getByRole("combobox", { name: "Test plan", exact: true })
    .selectOption("fixture");
  await expect(
    sandbox.getByRole("button", { name: "Open test checkout", exact: true }),
  ).toBeDisabled();
  await sandbox.getByRole("checkbox").check();
  await sandbox
    .getByRole("button", { name: "Open test checkout", exact: true })
    .click();
  await expect(sandbox.getByRole("alert")).toContainText(
    "Unexpected test checkout response",
  );
  expect(
    await page.evaluate(() =>
      Number(
        (window as unknown as { __sandboxOpened?: number }).__sandboxOpened ||
          0,
      ),
    ),
  ).toBe(0);
  await sandbox
    .getByRole("button", { name: "Open test checkout", exact: true })
    .click();
  await expect(sandbox.getByRole("status")).toContainText(
    "Waiting for independently verified test webhooks",
  );
  expect(posts).toBe(2);
  expect(requestKeys[0]).toBe(requestKeys[1]);
  await expect(
    sandbox.getByText("No independently verified test receipt.", {
      exact: true,
    }),
  ).toBeVisible();
  const after = await (await page.request.get("/api/data")).json();
  expect(after.agency.plan).toBe(before.agency.plan);
  expect(after.agency.subscription).toBe(before.agency.subscription);
  expect(after.agency.subscriptionExpiresAt).toBe(
    before.agency.subscriptionExpiresAt,
  );
  await sandbox.screenshot({
    path: "test-results/billing-sandbox-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await sandbox.screenshot({
    path: "test-results/billing-sandbox-mobile.png",
    animations: "disabled",
  });
});
