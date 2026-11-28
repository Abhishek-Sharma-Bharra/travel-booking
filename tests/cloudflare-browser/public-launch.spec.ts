import { test, expect, type Page } from "@playwright/test";
async function signup(page: Page) {
  const ip = "198.51.100." + (20 + Math.floor(Math.random() * 200));
  await page
    .context()
    .setExtraHTTPHeaders({ "CF-Connecting-IP": ip, "X-Forwarded-For": ip });
  const r = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      name: "Public Launch Tester",
      email: `public-launch-${Date.now()}-${Math.random().toString(16).slice(2)}@test.invalid`,
      password: "Fictional-launch-test-2026!",
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}
test("product, features, solutions and pricing open accessible dialogs and WhatsApp uses the authorised contact", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const title of [
    "Product",
    "Features",
    "Solutions",
    "AI Intelligence",
    "Pricing",
    "Demo",
    "Contact",
  ]) {
    const trigger = nav.getByRole("button", { name: title, exact: true });
    await trigger.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    if (title === "Pricing") {
      await expect(panel).toContainText("₹2,499");
      await expect(panel).toContainText("₹14,999");
      await expect(panel).toContainText("+ GST");
    }
    if (title === "Features")
      await expect(panel).toContainText("Quotations → bookings → documents");
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
  await expect(
    page.getByRole("link", { name: "Contact VASHISHT on WhatsApp" }),
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/919717956828\?text=/);
  await nav.getByRole("button", { name: "Product", exact: true }).click();
  await page
    .getByRole("button", { name: "Close information panel", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});
test("dark mode has readable AI content and persists through public pages, auth and agency workspace", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  const ai = page.locator(".saas-ai-section");
  await ai.scrollIntoViewIfNeeded();
  await expect(ai).toHaveCSS("background-color", "rgb(16, 23, 39)");
  await expect(ai.locator("h2")).toHaveCSS("color", "rgb(238, 240, 255)");
  await expect(ai.locator("p").first()).toHaveCSS(
    "color",
    "rgb(193, 202, 224)",
  );
  expect(
    await ai.evaluate((el) => getComputedStyle(el, "::before").backgroundImage),
  ).toContain("rgb(19, 28, 48)");
  await ai.screenshot({ path: "test-results/launch-ai-dark.png" });
  for (const path of [
    "/features",
    "/pricing",
    "/hotel-business",
    "/login",
    "/marketplace",
  ]) {
    await page.goto(path);
    await expect(page.locator(".public-appearance")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(16, 23, 39)",
    );
  }
  await signup(page);
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Skip tour", exact: true })
        .click();
    },
  );
  await page.goto("/workspace");
  await expect(page.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(28, 35, 56)",
  );
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toHaveCSS("color", "rgb(238, 240, 255)");
  for (const selector of [".metric", ".overview-pipeline", ".assistant-card", ".secondary-metrics"]) {
    await expect(page.locator(selector).first()).toHaveCSS("background-color", "rgb(28, 35, 56)");
  }
  await expect(page.locator(".lane-empty").first()).toHaveCSS("background-color", "rgb(37, 49, 75)");
  await page.screenshot({
    path: "test-results/launch-workspace-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use light appearance" }).click();
  await expect(page.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  expect(errors).toEqual([]);
});
test("admin routes preserve login destination and never expose platform totals to an ordinary owner", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=admin$/);
  await signup(page);
  const setup = await page.request.get("/admin/setup");
  // Next can stream its shell before notFound(), resulting in HTTP 200 with
  // the not-found document. Assert denied content as well as API authorization.
  expect([200, 404]).toContain(setup.status());
  const setupBody = await setup.text();
  expect(setupBody).toContain("This page could not be found");
  expect(setupBody).not.toContain("Set up your administrator account");
  const response = await page.request.get("/admin");
  expect([200, 404]).toContain(response.status());
  const adminBody = await response.text();
  expect(adminBody).toContain("This page could not be found");
  expect(adminBody).not.toContain("Platform overview");
  const mutation = await page.request.post("/api/admin/subscriptions", {
    headers: { Origin: "http://localhost:3000" },
    data: { agencyId: "foreign", plan: "Growth", status: "Active", days: 30 },
  });
  expect(mutation.status()).toBe(403);
});
