import { test, expect } from "./fixtures";
test("advanced dashboard uses server filters, truthful unavailable metrics, chart data and CSV on desktop/mobile", async ({
  page,
  request,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Advanced KPI dashboard", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Analytics from", { exact: true }).fill("2026-04-01");
  await page.getByLabel("Analytics to", { exact: true }).fill("2026-09-30");
  await expect(
    page.getByText("Showing 2026-04-01 through 2026-09-30", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator(".kpi-card").filter({
      has: page.getByRole("heading", {
        name: "Verified payment collections",
        exact: true,
      }),
    }),
  ).toContainText("Data unavailable");
  await expect(
    page.locator(".kpi-card").filter({
      has: page.getByRole("heading", { name: "Net profit", exact: true }),
    }),
  ).toContainText("Data unavailable");
  await expect(page.getByLabel("Campaign", { exact: true })).toBeDisabled();
  await page.getByLabel("Trend interval").selectOption("month");
  await expect(
    page.getByRole("button", { name: "Export analytics CSV", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".kpi-bar")).toHaveCount(6);
  await page.locator(".kpi-bar").first().click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export analytics CSV", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(
    "travelos-metrics-2026-04-01-2026-09-30",
  );
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString();
  expect(csv).toContain("Data unavailable");
  expect(csv).toContain("Asia/Kolkata");
  expect(csv).toContain("INR paise");
  await page
    .getByLabel("Analytics destination", { exact: true })
    .selectOption("Bali");
  await page.getByLabel("Group performance by").selectOption("source");
  await expect(
    page.getByText("Updating analytics…", { exact: false }),
  ).toHaveCount(0);
  const api = await request.get(
    "/api/analytics?demo=1&from=2026-04-01&to=2026-09-30&destination=Bali&grain=month&breakdown=source",
  );
  expect(api.status()).toBe(200);
  const body = await api.json();
  await expect(
    page
      .locator(".kpi-card")
      .filter({
        has: page.getByRole("heading", { name: "Total leads", exact: true }),
      })
      .locator(":scope > strong"),
  ).toHaveText(
    body.current
      .find((m: { key: string }) => m.key === "leads")
      .value.toLocaleString("en-IN"),
  );
  await expect(
    page.getByRole("button", {
      name: "Attest complete advertising coverage",
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/phase1-analytics-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/phase1-analytics-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const anonymous = await request.get(
    "/api/analytics?from=2026-04-01&to=2026-09-30",
  );
  expect(anonymous.status()).toBe(401);
  const fakeCampaign = await request.get(
    "/api/analytics?demo=1&from=2026-04-01&to=2026-09-30&campaign=fake",
  );
  expect(fakeCampaign.status()).toBe(400);
});
