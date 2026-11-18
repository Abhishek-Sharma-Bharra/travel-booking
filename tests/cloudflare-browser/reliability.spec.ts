import { test, expect } from "@playwright/test";
test("unverified hotel owner can open onboarding and save a private draft without bypassing publication", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      name: "Fictional Draft Owner",
      email: `draft-${Date.now()}@test.invalid`,
      password: "Fictional-draft-owner-2026!",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  await page.goto("/hotelier");
  await expect(
    page.getByRole("heading", { name: "Start your hotel registration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Register a hotel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Verify your email first", { exact: true }),
  ).toHaveCount(0);
  const response = await page.request.post("/api/hotelier", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      action: "create",
      profile: {
        name: "Fictional Private Draft",
        address: "123 Fictional Hotel Road",
        city: "Manali",
        region: "Himachal Pradesh",
        countryCode: "IN",
        postalCode: "175131",
        timezone: "Asia/Kolkata",
        contactEmail: "draft@test.invalid",
        contactPhone: "+919876543210",
        amenities: [],
        photoUrls: [],
        policies: "Check in at 14:00, check out at 11:00.",
        cancellationPolicy:
          "Contact the hotel for approved cancellation terms.",
        taxBps: 0,
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const draft = await response.json();
  expect(draft.status).toBe("DRAFT");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Submit for verification", exact: true }),
  ).toBeDisabled();
  const submit = await page.request.post("/api/hotelier", {
    headers: { Origin: "http://localhost:3000" },
    data: { action: "submit", hotelId: draft.hotelId, revision: 0 },
  });
  expect(submit.status()).toBe(403);
  await page.screenshot({
    path: "test-results/hotel-private-draft.png",
    fullPage: true,
  });
});
test("light homepage explains the product before workspace choice and has readable buttons on mobile", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/light-theme/);
    const image = page.getByRole("img", { name: /Travel coordinators/ });
    await expect(image).toBeVisible();
    expect(
      await image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    ).toBe(true);
    const colors = await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Agency sign in", exact: true })
      .evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
      }));
    expect(colors.color).toBe("rgb(38, 62, 85)");
    expect(colors.background).toBe("rgb(255, 255, 255)");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/light-home-${width}.png`,
      fullPage: true,
    });
  }
});
