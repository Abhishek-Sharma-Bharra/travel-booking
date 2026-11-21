import { test, expect } from "@playwright/test";

test("premium homepage explains real capabilities, keeps workspace links and makes no backend calls", async ({
  page,
}) => {
  const failures: string[] = [],
    apiCalls: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Pause slideshow", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const name of [
    "Home",
    "Features",
    "Solutions",
    "AI Intelligence",
    "Pricing",
    "Demo",
  ])
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Agency sign in" }),
  ).toHaveAttribute("href", "/login");
  const workspaces = page.getByRole("navigation", {
    name: "Choose your business workspace",
  });
  await expect(
    workspaces.getByRole("link", { name: "Hotel owners", exact: true }),
  ).toHaveAttribute("href", "/hotel-business");
  await expect(
    workspaces.getByRole("link", { name: "Car rental workspace", exact: true }),
  ).toHaveAttribute("href", "/operator?kind=CAR");
  await expect(page.locator("#pricing")).toContainText("₹499");
  await expect(page.locator("#pricing")).toContainText("₹999");
  await expect(page.locator("#pricing")).toContainText("₹1,999");
  await expect(page.locator("#pricing")).toContainText("Checkout not active");
  await expect(page.locator("#intelligence")).toContainText("synthetic data");
  await page
    .locator("summary")
    .filter({
      hasText: "Are the forecasts proven predictions for my business?",
    })
    .click();
  await expect(page.locator("details[open]")).toContainText(
    "time-based validation",
  );
  await page.goto("/pricing");
  await expect(
    page.getByRole("region", { name: "Proposed agency subscriptions" }),
  ).toContainText("₹499");
  await expect(
    page.getByRole("heading", {
      name: "Subscription-only offers, without booking commissions",
    }),
  ).toBeVisible();
  expect(apiCalls).toEqual([]);
  expect(failures).toEqual([]);
});

test("hero rotates every six seconds, pauses on hover and focus, and stops autoplay after manual interaction", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const hero = page.getByRole("region", { name: "Product highlights" });
  await expect(hero.locator(".carousel-count")).toHaveText("01 / 05");
  await page.mouse.move(1, 1);
  await page.clock.runFor(6100);
  await expect(hero.locator(".carousel-count")).toHaveText("02 / 05");
  await hero.hover();
  await page.clock.runFor(6500);
  await expect(hero.locator(".carousel-count")).toHaveText("02 / 05");
  await page.mouse.move(1, 1);
  await page.clock.runFor(6100);
  await expect(hero.locator(".carousel-count")).toHaveText("03 / 05");
  const next = hero.getByRole("button", { name: "Next slide", exact: true });
  await next.focus();
  await page.clock.runFor(6500);
  await expect(hero.locator(".carousel-count")).toHaveText("03 / 05");
  await next.press("ArrowRight");
  await expect(hero.locator(".carousel-count")).toHaveText("04 / 05");
  await expect(
    hero.getByRole("button", { name: "Play slideshow", exact: true }),
  ).toBeVisible();
  await next.blur();
  await page.mouse.move(1, 1);
  await page.clock.runFor(6500);
  await expect(hero.locator(".carousel-count")).toHaveText("04 / 05");
  await hero
    .getByRole("button", { name: "Show slide 5: intelligence" })
    .click();
  await expect(hero.getByRole("heading", { level: 1 })).toContainText(
    "Know your numbers.",
  );
});

test("hidden pages and reduced-motion preferences stop timed hero changes", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const count = page.locator(".carousel-count");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(6500);
  await expect(count).toHaveText("01 / 05");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: "Play slideshow", exact: true }),
  ).toBeDisabled();
  await page.clock.runFor(13000);
  await expect(count).toHaveText("01 / 05");
  await page.getByRole("button", { name: "Next slide", exact: true }).click();
  await expect(count).toHaveText("02 / 05");
});

test("feature storytelling switches the quotation preview and native FAQs remain keyboard accessible", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Quotes with the details covered/ })
    .click();
  await expect(
    page
      .locator("#feature-story-preview")
      .getByRole("img", { name: "Quotation studio fictional product preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Quotes with the details covered/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const faq = page
    .locator("summary")
    .filter({ hasText: "Who is Vashisht TravelOS for?" });
  await faq.focus();
  await faq.press("Enter");
  await expect(page.locator("details[open]")).toContainText("hotel teams");
});

test("mobile navigation, horizontal swipe and all five previews work without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const open = page.locator(".saas-menu-toggle");
  await open.click();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Solutions", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await page.locator(".hero").scrollIntoViewIfNeeded();
  await page.locator(".hero").evaluate((element) => {
    const touch = (x: number, y: number) =>
      new Touch({ identifier: 1, target: element, clientX: x, clientY: y });
    element.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        touches: [touch(290, 250)],
      }),
    );
    element.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        changedTouches: [touch(120, 260)],
      }),
    );
  });
  await expect(page.locator(".carousel-count")).toHaveText("02 / 05");
  await page.locator(".hero").evaluate((element) => {
    const touch = (x: number, y: number) =>
      new Touch({ identifier: 2, target: element, clientX: x, clientY: y });
    element.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        touches: [touch(200, 200)],
      }),
    );
    element.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        changedTouches: [touch(190, 400)],
      }),
    );
  });
  await expect(page.locator(".carousel-count")).toHaveText("02 / 05");
  for (let i = 0; i < 5; i++) {
    await page
      .getByRole("button", { name: new RegExp(`Show slide ${i + 1}:`) })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const clipped = await page
      .locator(
        ".saas-home h1, .saas-home h2, .saas-home h3, .saas-home p, .saas-home a, .saas-home button, .saas-home img, .saas-home .product-preview",
      )
      .evaluateAll((elements) =>
        elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.height > 0 &&
              (r.left < -1 || r.right > innerWidth + 1)
            );
          })
          .map(
            (el) =>
              el.getAttribute("aria-label") || el.textContent?.slice(0, 60),
          ),
      );
    expect(clipped).toEqual([]);
  }
  await page.getByRole("button", { name: "Show slide 1: agency" }).click();
  await expect(
    page.getByRole("button", { name: "Play slideshow", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: "test-results/premium-homepage/mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Pause slideshow", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/premium-homepage/desktop.png",
    fullPage: true,
  });
});

test("hero pauses while outside the viewport", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.locator("#workspaces").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator(".hero")
        .evaluate((el) => el.getBoundingClientRect().bottom < 0),
    )
    .toBe(true);
  await page.clock.runFor(6500);
  await expect(page.locator(".carousel-count")).toHaveText("01 / 05");
});

test("marketing content stays inside common mobile, tablet and desktop viewports", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const clipped = await page
      .locator(
        ".saas-home h1, .saas-home h2, .saas-home h3, .saas-home p, .saas-home a, .saas-home button, .saas-home img, .saas-home .product-preview",
      )
      .evaluateAll((elements) =>
        elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.height > 0 &&
              (r.left < -1 || r.right > innerWidth + 1)
            );
          })
          .map(
            (el) =>
              el.getAttribute("aria-label") || el.textContent?.slice(0, 60),
          ),
      );
    expect(clipped, `Clipped content at ${width}px`).toEqual([]);
  }
});
