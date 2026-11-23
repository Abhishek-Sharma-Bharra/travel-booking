import { test, expect, type Page } from "@playwright/test";
const origin = "http://localhost:3000";
test.beforeAll(async ({ request }) => {
  await expect
    .poll(
      async () => {
        try {
          const r = await request.get("/api/health/live");
          return r.status() === 200 && (await r.json()).status === "up";
        } catch {
          return false;
        }
      },
      { timeout: 30000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
});
async function nav(page: Page, name: string) {
  const button = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    }),
    mobile = await button.isVisible();
  if (mobile) await button.click();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name, exact: true })
    .click();
  if (mobile)
    await expect
      .poll(async () => {
        const box = await page.locator(".sidebar").boundingBox();
        return !box || box.x + box.width <= 1;
      })
      .toBe(true);
}
test("signup opens a light premium studio with real onboarding and grounded assistant review handoffs", async ({
  page,
}) => {
  const address = "203.0.113." + (30 + Math.floor(Math.random() * 180));
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": address,
    "CF-Connecting-IP": address,
  });
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Skip tour", exact: true })
        .click();
    },
  );
  const entered = await page.goto("/login?signup=1");
  expect(entered?.status()).toBe(200);
  await page.getByLabel("Your name", { exact: true }).fill("Aanya Studio");
  await page
    .getByLabel("Work email", { exact: true })
    .fill(`studio-${Date.now()}@test.invalid`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-studio-account-2026!");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(
    page.getByRole("heading", {
      name: "Welcome to your next chapter, Aanya.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("0 of 3 foundations in place", { exact: true }),
  ).toBeVisible();
  const sidebar = await page
    .locator(".sidebar")
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(sidebar).toBe("rgb(255, 255, 255)");
  await page.screenshot({
    path: "test-results/studio-new-agency-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Start packages", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "New package", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  let data = await (await page.request.get("/api/data")).json();
  const action = async (action: string, input: unknown) => {
    const r = await page.request.post("/api/action", {
      headers: { Origin: origin },
      data: { action, input },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  for (const [name, destination] of [
    ["A Other Journey", "Bali"],
    ["Studio Kerala Journey", "Kerala"],
  ])
    await action("package", {
      name,
      destination,
      days: 4,
      itinerary: "Arrival and transfer from maintained agency itinerary.",
      inclusions: "Hotel and transfer",
      exclusions: "Flights",
      paymentTerms: "Review deposit terms with agency",
      cancellationTerms: "Refunds require reviewed terms",
      price: "12345.67",
      estimatedCost: "9000",
    });
  await action("lead", {
    lead: {
      externalId: "STUDIO-" + Date.now(),
      customer: "Fictional Studio Traveller",
      email: "traveller@test.invalid",
      phone: "+919876543210",
      destination: "Kerala",
      enquiryDate: "2026-11-22",
      travelStart: "2026-12-01",
      travelEnd: "2026-12-04",
      travellers: 3,
      budget: "30000",
      quotedPrice: "0",
      source: "Website",
      assignedId: data.actor.id,
      stage: "New",
    },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "A clearer day starts here, Aanya.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("2 of 3 foundations in place", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/studio-dashboard-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.screenshot({
    path: "test-results/studio-dashboard-preview.png",
    animations: "disabled",
  });
  data = await (await page.request.get("/api/data")).json();
  const lead = data.leads[0],
    pkg = data.packages.find(
      (p: { destination: string }) => p.destination === "Kerala",
    );
  await page
    .getByRole("button", { name: "Open travel assistant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your records. A clearer next step.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", {
      name: "Live AI routing · not enabled",
      exact: true,
    }),
  ).toHaveAttribute("disabled", "");
  const console = page.getByRole("region", {
    name: "Grounded workspace assistant",
    exact: true,
  });
  await console.getByRole("textbox", { name: /Your question/ }).fill("hello");
  await console
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    console.getByRole("heading", { name: "How I can help", exact: true }),
  ).toBeVisible();
  const conversation = console.getByRole("log", {
    name: "Conversation messages",
  });
  await expect(conversation.getByText("hello", { exact: true })).toBeVisible();
  await console
    .getByRole("textbox", { name: /Your question/ })
    .fill("Prepare my quotation draft");
  await console
    .getByRole("combobox", { name: /What would you like to review/ })
    .selectOption("quotation");
  await console
    .getByRole("combobox", { name: /Enquiry context/ })
    .selectOption(lead.id);
  await console
    .getByRole("combobox", { name: /Package context/ })
    .selectOption(pkg.id);
  await console
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    console.getByRole("heading", {
      name: "Recorded-rate quotation preview",
      exact: true,
    }),
  ).toBeVisible();
  await expect(console.getByText("₹37,037.01", { exact: true })).toBeVisible();
  await expect(conversation.locator(".conversation-turn")).toHaveCount(2);
  await expect(
    console.getByRole("combobox", { name: /What would you like to review/ }),
  ).toHaveValue("auto");
  await expect(
    console.getByRole("textbox", { name: /Your question/ }),
  ).toHaveValue("");
  expect(
    (await (await page.request.get("/api/data")).json()).quotes,
  ).toHaveLength(0);
  await page.screenshot({
    path: "test-results/studio-assistant-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await console
    .getByRole("button", { name: "Review in existing workflow", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Build a quotation",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("combobox", { name: /^Package/ })).toHaveValue(
    pkg.id,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await console
    .getByRole("combobox", { name: /What would you like to review/ })
    .selectOption("itinerary");
  await console
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    console.getByRole("heading", {
      name: "Package-grounded itinerary draft",
      exact: true,
    }),
  ).toBeVisible();
  await console
    .getByRole("button", { name: "Review in existing workflow", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: /^Source package/ }),
  ).toHaveValue(pkg.id);
  await expect(page.getByRole("combobox", { name: /^Enquiry/ })).toHaveValue(
    lead.id,
  );
  await nav(page, "Overview");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", {
      name: "A clearer day starts here, Aanya.",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await nav(page, "AI Travel Agent");
  await expect(
    page.getByRole("heading", {
      name: "Your records. A clearer next step.",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-assistant-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await console
    .getByRole("combobox", { name: /Enquiry context/ })
    .selectOption(lead.id);
  await console
    .getByRole("combobox", { name: /Package context/ })
    .selectOption(pkg.id);
  await console.getByRole("textbox", { name: /Your question/ }).fill("नमस्ते");
  await console
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    console.getByRole("heading", { name: "How I can help", exact: true }),
  ).toBeVisible();
  await expect(conversation.locator(".conversation-turn")).toHaveCount(1);
  await console
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(conversation.locator(".conversation-turn")).toHaveCount(0);
  await expect(
    console.getByRole("textbox", { name: /Your question/ }),
  ).toHaveValue("");
  await expect(
    console.getByRole("combobox", { name: /Enquiry context/ }),
  ).toHaveValue("");
  await expect(
    console.getByRole("combobox", { name: /Package context/ }),
  ).toHaveValue("");
  await expect(
    console.getByRole("heading", {
      name: "What shall we work on today?",
      exact: true,
    }),
  ).toBeVisible();
});
