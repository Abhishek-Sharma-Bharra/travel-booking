import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
const origin = "http://localhost:3000";
test("compact product flyout and restrained service headings match desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Product", exact: true })
    .click();
  const menu = page.getByRole("dialog");
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("heading", { name: "Travel CRM & lead management" }),
  ).toBeVisible();
  expect((await menu.boundingBox())!.y).toBeLessThan(100);
  await expect(menu.getByRole("heading", { level: 3 }).first()).toHaveCSS(
    "font-size",
    "17px",
  );
  await page.screenshot({ path: "test-results/compact-product-menu.png" });
  await page.keyboard.press("Escape");
  const headings = page.locator(".saas-solution-banner h2");
  for (let n = 0; n < (await headings.count()); n++)
    expect(
      parseFloat(
        await headings.nth(n).evaluate((el) => getComputedStyle(el).fontSize),
      ),
    ).toBeLessThanOrEqual(34);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Product", exact: true })
    .click();
  await expect(menu).toBeVisible();
  expect(
    await menu.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
});
test("agency issues a reviewed immutable GST invoice and sees customer and official messaging workspaces", async ({
  page,
}) => {
  const ip = "198.51.100." + (20 + Math.floor(Math.random() * 200));
  await page
    .context()
    .setExtraHTTPHeaders({ "CF-Connecting-IP": ip, "X-Forwarded-For": ip });
  const r = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: {
      name: "Commerce browser",
      email: `commerce-${Date.now()}@test.invalid`,
      password: "Fictional-commerce-browser-2026!",
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const act = async (action: string, input: any) => {
    const r = await page.request.post("/api/action", {
      headers: { Origin: origin },
      data: { action, input },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const initial = await (await page.request.get("/api/data")).json();
  await act("package", {
    name: "Commerce test trip",
    destination: "Manali",
    days: 5,
    inclusions: "Stay",
    exclusions: "Flights",
    price: "1000",
    estimatedCost: "500",
  });
  await act("lead", {
    lead: {
      externalId: "COM-1",
      customer: "Commerce Traveller",
      email: "traveller@test.invalid",
      phone: "+919000000001",
      destination: "Manali",
      enquiryDate: "2026-11-28",
      travelStart: "2026-12-10",
      travelEnd: "2026-12-15",
      travellers: 1,
      budget: "1180",
      quotedPrice: "0",
      source: "Website",
      assignedId: initial.actor.id,
      stage: "New",
    },
  });
  const d = await (await page.request.get("/api/data")).json();
  const q = await act("quote", {
    leadId: d.leads[0].id,
    packageId: d.packages[0].id,
    discount: "0",
    tax: "18",
  });
  const b = await act("accept", { id: q.quoteId, dueDate: "2026-12-10" });
  await page.goto("/workspace/commerce");
  await expect(
    page.getByRole("heading", { name: "Accounts & customer portal" }),
  ).toBeVisible();
  await page.getByLabel("Booking", { exact: true }).selectOption(b.bookingId);
  const supplier = page.getByRole("group", {
    name: "Your registered business",
  });
  await supplier.getByLabel("Legal name").fill("Fictional registered supplier");
  await supplier
    .getByLabel("Address", { exact: true })
    .fill("Fictional New Delhi office address");
  let base = "07ABCDE1234F1Z",
    factor = 2,
    sum = 0;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 13; i >= 0; i--) {
    const n = chars.indexOf(base[i]) * factor;
    sum += Math.floor(n / 36) + (n % 36);
    factor = factor === 2 ? 1 : 2;
  }
  await supplier.getByLabel("GSTIN").fill(base + chars[(36 - (sum % 36)) % 36]);
  await supplier.getByLabel("State code").fill("07");
  const recipient = page.getByRole("group", {
    name: "Customer billing details",
  });
  await recipient.getByLabel("Legal name").fill("Commerce Traveller");
  await recipient
    .getByLabel("Address", { exact: true })
    .fill("Fictional customer New Delhi address");
  await recipient.getByLabel("State code").fill("07");
  await page.getByLabel("Place of supply").fill("07");
  await page.getByLabel("Service description").fill("Reviewed travel service");
  await page.getByLabel("SAC").fill("998555");
  await page.getByLabel("Eligible taxable amount").fill("1000");
  await page.getByLabel("Reviewed GST rate").selectOption("1800");
  await page
    .getByLabel("Tax basis / treatment")
    .fill("Fictional accountant-reviewed service tax basis");
  await page.getByLabel("Document purpose").fill("Travel service invoice");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Preview document" }).click();
  await expect(
    page.getByRole("heading", { name: "Review before issue" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Issue immutable document" }).click();
  await expect(
    page.getByRole("heading", { name: "GST tax invoice", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Issued tax document" }),
  ).toContainText("₹1,180");
  await page.emulateMedia({media:'print'});
  const pdf=await page.pdf({format:'A4',printBackground:true,path:'test-results/issued-gst-document.pdf'});
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length).toBe(1);
  await page.emulateMedia({media:'screen'});
  await page.screenshot({
    path: "test-results/issued-gst-document.png",
    fullPage: true,
  });
  await page.goto("/workspace/communications");
  await expect(
    page.getByRole("heading", { name: "Official WhatsApp", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect authorised number" }),
  ).toBeDisabled();
  await page.goto("/customer");
  await expect(
    page.getByRole("heading", { name: "Your private travel portal" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("private invitation");
  const denied = await page.request.get("/api/customer");
  expect(denied.status()).toBe(401);
  // Local-only fixture delivery: production sender is deliberately unconfigured.
  // The service-level tests exercise invitation generation with mocked mail delivery.
  const token = randomBytes(32).toString("base64url");
  const literal = (v: string) => "'" + v.replaceAll("'", "''") + "'";
  const values = [
    randomUUID(),
    initial.agency.id,
    b.bookingId,
    createHash("sha256").update(token).digest("hex"),
    "traveller@test.invalid",
    initial.actor.id,
    new Date().toISOString(),
    new Date(Date.now() + 86400000).toISOString(),
  ]
    .map(literal)
    .join(",");
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "TRAVELOS_DB",
      "--local",
      "--config",
      "cloudflare/worker/wrangler.jsonc",
      "--persist-to",
      ".local/cloudflare-state",
      "--command",
      "INSERT INTO CustomerInvitation(id,agencyId,bookingId,tokenHash,email,actorId,createdAt,expiresAt) VALUES(" +
        values +
        ")",
    ],
    {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: "/workspace/.config",
        WRANGLER_LOG_PATH: ".local/cloudflare-logs",
      },
      stdio: "pipe",
    },
  );
  await page.goto("/customer#invite=" + token);
  await page.getByRole("button", { name: "Continue to my booking" }).click();
  await expect(
    page.getByRole("heading", { name: "Commerce test trip", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your documents" }),
  ).toBeVisible();
  expect(page.url()).not.toContain(token);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "travelos_customer",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await page.request.get("/api/customer")).status()).toBe(401);
});
test("browser voice permission is opt-in and unsupported browsers keep the typing flow", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
      configurable: true,
    });
  });
  const ip = "203.0.113." + (20 + Math.floor(Math.random() * 200));
  await page
    .context()
    .setExtraHTTPHeaders({ "CF-Connecting-IP": ip, "X-Forwarded-For": ip });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: {
      name: "Voice tester",
      email: `voice-${Date.now()}@test.invalid`,
      password: "Fictional-voice-browser-2026!",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  await page.goto("/workspace");
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Skip tour", exact: true })
        .click();
    },
  );
  await page
    .getByRole("button", { name: "Open travel assistant", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Dictate your question" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Voice input is unavailable in this browser; typing works normally.",
    ),
  ).toBeVisible();
});
