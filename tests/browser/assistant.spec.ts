import { test, expect } from "@playwright/test";
test("fictional assistant preview, priorities, follow-up copying and mobile demo safety", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Today’s priorities" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Enquiries/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Create from customer message" })
    .click();
  await page.getByRole("button", { name: "Load fictional preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Fictional preview — not live AI" }),
  ).toBeVisible();
  await expect(page.getByLabel("Destination", { exact: true })).toHaveValue(
    "Bali",
  );
  await expect(page.getByLabel("Budget amount", { exact: true })).toHaveValue(
    "120000",
  );
  await expect(
    page.getByLabel("Exact travel start (if known)", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Extract with live AI" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Review in enquiry form — not saved yet",
    }),
  ).toBeDisabled();
  await page.getByLabel("Search enquiries").fill("VT-0001");
  await page
    .getByRole("button", { name: "Demo Traveller 0001", exact: true })
    .click();
  await page.getByRole("button", { name: "Prepare template draft" }).click();
  await expect(
    page.getByRole("button", { name: "Open in WhatsApp", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Editable follow-up draft")).not.toHaveValue("");
  await expect(
    page.getByText("No automatic sending.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/assistant-detail.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/assistant-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("live extraction failure retains input and reviewed draft saves only after explicit confirmation", async ({
  page,
}) => {
  const { db } = await import("../../src/lib/db");
  const email = `assistant-browser-${Date.now()}@example.test`;
  try {
    await page.goto("/login?signup=1");
    await page.getByLabel("Your name").fill("Assistant Test");
    await page.getByLabel("Work email").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Assistant-test-password-2026!");
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(page).toHaveURL(/\/workspace/);
    await page
      .getByRole("button", { name: /^Enquiries/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Create from customer message" })
      .click();
    const text =
      "December mein 2 adults ka Bali honeymoon chahiye, 5 nights, total budget 1.2 lakh.";
    await page.getByLabel("Original customer message").fill(text);
    await page.getByRole("button", { name: "Extract with live AI" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("not configured");
    await expect(page.getByLabel("Original customer message")).toHaveValue(
      text,
    );
    await page.getByRole("button", { name: "Load fictional preview" }).click();
    await page
      .getByLabel("Customer name", { exact: true })
      .fill("Reviewed Test");
    await page
      .getByRole("button", { name: "Review in enquiry form — not saved yet" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Travel start")).toHaveValue("");
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await db.lead.count({ where: { agencyId: u.agencyId! } })).toBe(0);
    const start = new Date(Date.now() + 45 * 86400000)
        .toISOString()
        .slice(0, 10),
      end = new Date(Date.now() + 50 * 86400000).toISOString().slice(0, 10);
    await dialog.getByLabel("Phone (optional)").fill("+12025550123");
    await dialog.getByLabel("Travel start").fill(start);
    await dialog.getByLabel("Travel end").fill(end);
    await dialog.getByRole("button", { name: "Save record" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const l = await db.lead.findFirstOrThrow({
      where: { agencyId: u.agencyId! },
    });
    expect(l.originalMessage).toBe(text);
    expect((l.requirementDraft as { budgetAmount: number }).budgetAmount).toBe(
      120000,
    );
    expect(l.budget).toBe(0);
    expect(await db.lead.count({ where: { agencyId: u.agencyId! } })).toBe(1);
    const p = await db.package.create({
      data: {
        agencyId: u.agencyId!,
        name: "Reviewed Bali package",
        destination: "Bali",
        days: 6,
        price: 5000000,
        estimatedCost: 3500000,
        inclusions: "Recorded hotel category",
        exclusions: "Flights",
        itinerary: "Day 1: Supplier activities require confirmation.",
        paymentTerms: "Deposit amount to be agreed",
        cancellationTerms: "Supplier terms pending confirmation",
      },
    });
    await page.reload();
    await page
      .getByRole("button", { name: /^Enquiries/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Reviewed Test", exact: true })
      .click();
    const eventsBefore = await db.activity.count({
      where: { agencyId: u.agencyId! },
    });
    await page.getByRole("button", { name: "Prepare template draft" }).click();
    const edited = "Hello & नमस्ते, please review your trip.";
    await page.getByLabel("Editable follow-up draft").fill(edited);
    await page.evaluate(() => {
      window.open = ((url: unknown) => {
        (window as unknown as { whatsappOpened: string }).whatsappOpened =
          String(url);
        return null;
      }) as typeof window.open;
    });
    await page
      .getByRole("button", { name: "Open in WhatsApp", exact: true })
      .click();
    const opened = await page.evaluate(
      () => (window as unknown as { whatsappOpened: string }).whatsappOpened,
    );
    expect(new URL(opened).pathname).toBe("/12025550123");
    expect(new URL(opened).searchParams.get("text")).toBe(edited);
    expect(await db.activity.count({ where: { agencyId: u.agencyId! } })).toBe(
      eventsBefore,
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Not marked sent" }),
    ).toBeVisible();

    await page
      .getByText("Generate itinerary & quote draft", { exact: true })
      .click();
    await page.getByLabel("Suitable package").selectOption(p.id);
    await page
      .getByRole("button", { name: "Prepare package-based itinerary" })
      .click();
    await expect(page.getByLabel("Editable customer proposal")).toHaveValue(
      /Day 1/,
    );
    await page
      .getByRole("button", { name: "Review deterministic quotation" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save record" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Quotations", exact: true }).click();
    await page.getByRole("button", { name: "Print / view" }).click();
    await expect(
      page.getByRole("button", { name: "Print / save PDF" }),
    ).toBeDisabled();
    await expect(page.locator(".print-sheet")).not.toContainText(
      "Estimated supplier cost",
    );
    await expect(page.locator(".print-sheet")).toContainText("₹1,00,000");
    await page
      .getByRole("button", { name: "Approve reviewed quotation" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Print / view" }).click();
    await expect(
      page.getByRole("button", { name: "Print / save PDF" }),
    ).toBeEnabled();
    await page.screenshot({
      path: "test-results/assistant-reviewed-quote.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Accept & book" }),
    ).toBeVisible();
  } finally {
    const u = await db.user.findUnique({ where: { email } });
    if (u?.agencyId) {
      const agencyId = u.agencyId;
      await db.activity.deleteMany({ where: { agencyId } });
      await db.quote.deleteMany({ where: { agencyId } });
      await db.package.deleteMany({ where: { agencyId } });
      await db.lead.deleteMany({ where: { agencyId } });
      await db.user.delete({ where: { id: u.id } });
      await db.agency.delete({ where: { id: agencyId } });
    }
    await db.$disconnect();
  }
});
