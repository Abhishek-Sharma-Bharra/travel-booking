import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
test("premium proposals, dark preference, and CRM review work without changing legacy contracts", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator(".public-appearance")).toHaveAttribute(
    "data-appearance",
    "dark",
  );
  await expect(page.locator(".saas-home")).toHaveCSS(
    "background-color",
    "rgb(16, 23, 39)",
  );
  await page.goto("/pricing");
  await expect(page.locator(".public-appearance")).toHaveAttribute(
    "data-appearance",
    "dark",
  );
  await expect(
    page.getByRole("heading", { name: "AI Growth", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Annual terms on request", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "Upcoming / subject to setup",
  );
  await expect(page.locator(".pricing-card").first()).toHaveCSS(
    "background-color",
    "rgb(28, 35, 56)",
  );
  await expect(page.locator(".pricing-card li").first()).toHaveCSS(
    "color",
    "rgb(193, 202, 224)",
  );
  await page.screenshot({
    path: "test-results/erp-pricing-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use light appearance" }).click();
  await page.goto("/pricing");
  await expect(page.locator(".public-appearance")).toHaveAttribute(
    "data-appearance",
    "light",
  );
  const address = "198.51.100." + (20 + Math.floor(Math.random() * 200));
  await page.context().setExtraHTTPHeaders({
    "CF-Connecting-IP": address,
    "X-Forwarded-For": address,
  });
  const r = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      name: "ERP Pilot",
      email: `erp-${Date.now()}@test.invalid`,
      password: "Fictional-ERP-review-2026!",
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const user = (await r.json()).user;
  const seed = {
    destination: "Delhi",
    enquiryDate: "2026-11-27",
    travelStart: "2026-12-10",
    travelEnd: "2026-12-12",
    travellers: 2,
    budget: "20000",
    quotedPrice: "0",
    source: "Website",
    assignedId: user.id,
    phone: "+919876543210",
    email: "household@test.invalid",
    followUp: "2026-11-27",
  };
  for (const [id, customer, stage] of [
    ["ERP-A", "First household", "New"],
    ["ERP-B", "Second household", "Lost"],
  ]) {
    const response = await page.request.post("/api/action", {
      headers: { Origin: "http://localhost:3000" },
      data: {
        action: "lead",
        input: {
          lead: {
            ...seed,
            externalId: id,
            customer,
            stage,
            lostReason: stage === "Lost" ? "Price" : "",
          },
        },
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  const before = await (await page.request.get("/api/data")).json();
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Skip tour", exact: true })
        .click();
    },
  );
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Use dark appearance" }),
  ).toBeVisible();
  await nav(page, "CRM review");
  const review = page.getByRole("region", { name: "CRM review centre" });
  await expect(
    review.getByRole("heading", { name: "Exact-contact candidates" }),
  ).toBeVisible();
  await review.getByLabel("Review group").selectOption("Possible duplicates");
  await expect(
    review.getByText("2 records · page 1", { exact: true }),
  ).toBeVisible();
  await review.getByLabel("Review group").selectOption("Closed lost");
  await expect(
    review.getByRole("button", { name: "Review enquiry ERP-B", exact: true }),
  ).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Review enquiry ERP-A", exact: true }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await review.getByRole("button", { name: "Export CSV" }).first().click();
  expect((await download).suggestedFilename()).toContain("crm-review");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const box = await page.locator(".sidebar").boundingBox();
      return box ? box.x + box.width : 0;
    })
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: "test-results/erp-crm-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const after = await (await page.request.get("/api/data")).json();
  expect(after.agency.plan).toBe(before.agency.plan);
  expect(after.agency.subscription).toBe(before.agency.subscription);
  expect(after.leads).toEqual(before.leads);
  await review
    .getByRole("button", { name: "Review enquiry ERP-B", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(failures).toEqual([]);
});
