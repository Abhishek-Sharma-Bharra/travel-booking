import { test, expect } from "@playwright/test";
test("agency owner sees provider setup readiness on D1 without exposing or inventing credentials", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      name: "Integration Setup Owner",
      email: `ads-setup-${Date.now()}@test.invalid`,
      password: "Fictional-ads-setup-test-2026!",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const report = await page.request.get("/api/integrations");
  expect(report.ok(), await report.text()).toBeTruthy();
  const body = await report.json();
  expect(body.configured).toEqual({ META: false, GOOGLE: false });
  expect(body.setup.META.callbackUrl).toBe(
    "http://localhost:3000/api/integrations/meta/callback",
  );
  expect(body.setup.GOOGLE.missing).toContain("GOOGLE_ADS_DEVELOPER_TOKEN");
  expect(body.connections).toHaveLength(0);
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
    () => page.getByRole("button", { name: "Skip tour", exact: true }).click(),
  );
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Agency integrations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Meta Ads", exact: true }),
  ).toBeDisabled();
  for (const detail of await page.locator("details").all())
    await detail.locator("summary").click();
  await expect(
    page.getByText("Backend configuration pending:", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/agency-integrations-setup-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("aside.sidebar")).not.toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/agency-integrations-setup-mobile.png",
    fullPage: true,
  });
});
