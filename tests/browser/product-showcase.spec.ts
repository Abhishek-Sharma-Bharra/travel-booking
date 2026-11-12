import { test, expect } from "@playwright/test";
test("CRM product preview tabs work with mouse and keyboard, and preview image is optimized", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Keep your enquiries moving.",
  );
  const hero = page.getByRole("tabpanel").getByRole("img");
  await hero.scrollIntoViewIfNeeded();
  await expect(hero).toBeVisible();
  await expect
    .poll(() =>
      hero.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const image = await request.get((await hero.getAttribute("src"))!, {
    headers: { Accept: "image/webp" },
  });
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toMatch(/^image\//);
  expect((await image.body()).byteLength).toBeLessThan(700000);
  const tabs = page.getByRole("tablist", { name: "Explore TravelOS screens" });
  await expect(
    tabs.getByRole("tab", { name: "Enquiries", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "Quotations", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Saved quotation versions",
  );
  await expect(page.getByRole("tabpanel").getByRole("img")).toHaveAttribute(
    "alt",
    /quotations/,
  );
  await page.keyboard.press("End");
  await expect(
    tabs.getByRole("tab", { name: "Bookings", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "outstanding customer balances",
  );
  await page.keyboard.press("Home");
  await expect(
    tabs.getByRole("tab", { name: "Enquiries", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Customer requirements",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await tabs.getByRole("tab", { name: "Bookings", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
