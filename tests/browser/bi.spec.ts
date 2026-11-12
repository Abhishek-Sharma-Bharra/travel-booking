import { test, expect } from "./fixtures";
import { db } from "../../src/lib/db";
import { biStorageKey } from "../../src/lib/bi";
const key = "bi-browser-" + Date.now();
test.afterAll(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: key } },
  });
  for (const agencyId of new Set(
    users.map((u) => u.agencyId).filter((x): x is string => !!x),
  )) {
    for (const model of [
      db.activity,
      db.transaction,
      db.booking,
      db.quote,
      db.lead,
      db.package,
      db.spend,
      db.invitation,
      db.user,
    ] as any[])
      await model.deleteMany({ where: { agencyId } });
    await db.agency.delete({ where: { id: agencyId } });
  }
  await db.$disconnect();
});
test("BI demo builds reports, drills source and dates, exports unavailable metrics, and works on mobile", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "BI Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Business intelligence reports",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("BI from", { exact: true }).fill("2026-04-01");
  await page.getByLabel("BI to", { exact: true }).fill("2026-09-30");
  await expect(page.getByLabel("BI report period")).toContainText(
    "Showing 2026-04-01 through 2026-09-30",
  );
  await page
    .getByText("Choose report metrics and columns", { exact: true })
    .click();
  await page.getByLabel("Net profit", { exact: true }).check();
  await expect(
    page.locator(".bi-summary").filter({
      has: page.getByRole("heading", { name: "Net profit", exact: true }),
    }),
  ).toContainText("Data unavailable");
  await page
    .getByLabel("BI trend interval", { exact: true })
    .selectOption("month");
  await expect(
    page.getByRole("status").filter({ hasText: "Updating BI report" }),
  ).toHaveCount(0);
  await page.getByLabel("BI chart style", { exact: true }).selectOption("line");
  await expect(page.locator(".bi-chart polyline")).toHaveCount(1);
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export BI metrics CSV", exact: true })
    .click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const parts = [];
  for await (const part of stream!) parts.push(part);
  const csv = Buffer.concat(parts).toString();
  expect(csv).toContain("Data unavailable");
  expect(csv).toContain("INR paise");
  expect(csv).toContain("Asia/Kolkata");
  await page
    .getByRole("button", { name: "Filter source: Meta Ads", exact: true })
    .click();
  await expect(page.getByLabel("BI Source", { exact: true })).toHaveValue(
    "Meta Ads",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Updating BI report" }),
  ).toHaveCount(0);
  await page
    .getByText("Trend data and date drill-down", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Filter period 2026-04-01", exact: true })
    .click();
  await expect(page.getByLabel("BI from", { exact: true })).toHaveValue(
    "2026-04-01",
  );
  await expect(page.getByLabel("BI to", { exact: true })).toHaveValue(
    "2026-04-30",
  );
  await expect(page.getByLabel("BI report period")).toContainText(
    "Showing 2026-04-01 through 2026-04-30",
  );
  await expect(
    page.getByRole("button", { name: "Save BI view", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/bi-mobile.png", fullPage: true });
});
test("BI personal settings persist per user; foreign and financial saved-view input cannot bypass server scope", async ({
  page,
}) => {
  // Independent fictional client identity keeps production signup rate limits enabled.
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "192.0.2.150" });
  const signup = async (suffix: string) => {
    const r = await page.request.post("/api/auth/sign-up/email", {
      headers: {
        Origin: "http://localhost:3000",
        "X-Forwarded-For": "192.0.2.150",
      },
      data: {
        name: "BI Test " + suffix,
        email: key + suffix + "@test.invalid",
        password: "Fictional-bi-password-2026!",
      },
    });
    expect(r.ok()).toBe(true);
    return await (await page.request.get("/api/data")).json();
  };
  const first = await signup("one");
  const lead = await page.request.post("/api/action", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      action: "lead",
      input: {
        lead: {
          customer: "BI Tenant One Customer",
          externalId: key,
          destination: "Kerala",
          enquiryDate: "2026-11-12",
          travelStart: "2027-01-01",
          travelEnd: "2027-01-05",
          travellers: 1,
          budget: "10000",
          quotedPrice: "0",
          source: "Website",
          stage: "New",
          assignedId: first.actor.id,
        },
      },
    },
  });
  expect(lead.ok()).toBe(true);
  await page.goto("/workspace");
  await page.getByRole("button", { name: "BI Reports", exact: true }).click();
  await expect(page.getByLabel("BI report period")).toBeVisible();
  await page
    .getByLabel("Report name", { exact: true })
    .fill("My source report");
  await page.getByRole("button", { name: "Save BI view", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report settings saved" }),
  ).toBeVisible();
  const storage = biStorageKey(first.agency.id, first.actor.id);
  const saved = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    storage,
  );
  expect(Object.keys(saved[0]).sort()).toEqual([
    "cards",
    "chart",
    "columns",
    "id",
    "name",
    "query",
    "trend",
  ]);
  await page.reload();
  await page.getByRole("button", { name: "BI Reports", exact: true }).click();
  await page
    .getByLabel("Saved BI views", { exact: true })
    .selectOption({ label: "My source report" });
  await expect(page.getByLabel("Report name", { exact: true })).toHaveValue(
    "My source report",
  );
  const second = await signup("two");
  await db.user.update({
    where: { id: second.actor.id },
    data: { role: "AGENT" },
  });
  const forged = {
    ...saved[0],
    name: "Foreign agent report",
    query: { ...saved[0].query, agent: first.actor.id },
    cards: ["costs", "contribution", "leads"],
    columns: ["recordedCosts", "contribution", "leads"],
  };
  await page.evaluate(
    ({ key, view }) => localStorage.setItem(key, JSON.stringify([view])),
    { key: biStorageKey(second.agency.id, second.actor.id), view: forged },
  );
  await page.goto("/workspace");
  await page.getByRole("button", { name: "BI Reports", exact: true }).click();
  await expect(page.getByLabel("BI report period")).toBeVisible();
  await expect(
    page.getByLabel("Saved BI views", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await expect(
    page.getByLabel("Saved BI views", { exact: true }),
  ).not.toContainText("My source report");
  await page
    .getByText("Choose report metrics and columns", { exact: true })
    .click();
  await expect(
    page.getByLabel("Recorded direct costs", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Contribution margin", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Saved BI views", { exact: true })
    .selectOption({ label: "Foreign agent report" });
  await expect(page.locator(".bi-reports").getByRole("alert")).toContainText(
    "Agents can report only assigned enquiries",
  );
  await expect(page.locator(".bi-summary-grid")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reset BI filters", exact: true })
    .click();
  await expect(page.getByLabel("BI report period")).toBeVisible();
  await expect(
    page
      .locator(".bi-summary")
      .filter({
        has: page.getByRole("heading", { name: "Total leads", exact: true }),
      })
      .locator("strong"),
  ).toHaveText("0");
  await expect(page.locator(".bi-reports")).not.toContainText(
    "BI Tenant One Customer",
  );
});
