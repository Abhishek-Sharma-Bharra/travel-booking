import { test, expect } from "@playwright/test";
import { publicPages } from "../../src/lib/seo";
const origin = "https://vashisht-travelos.onrender.com";
test("public marketing pages have distinct server-rendered SEO and honest pricing/contact", async ({
  page,
}) => {
  const titles = new Set<string>();
  for (const path of publicPages) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const title = await page.title();
    expect(title).toContain("Vashisht TravelOS");
    expect(titles.has(title)).toBe(false);
    titles.add(title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.{40,}/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      origin + (path === "/" ? "" : path),
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /^index, follow$/,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      origin + (path === "/" ? "" : path),
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    // The HTML response itself has the copy and metadata: crawlers need no client JS.
    const html = await response!.text();
    expect(html).toContain('<meta name="description"');
  }
  await page.goto("/pricing");
  await expect(page.getByText("Price on request", { exact: true })).toHaveCount(
    3,
  );
  await expect(
    page.getByText("Up to 3,000 stored enquiries", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Billing is currently handled manually", { exact: false }),
  ).toBeVisible();
  await page.goto("/contact?plan=Growth");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    origin + "/contact",
  );
  await expect(
    page.getByRole("link", { name: "avinav.vashisht@gmail.com", exact: true }),
  ).toHaveAttribute("href", /^mailto:avinav\.vashisht@gmail\.com\?/);
  await page.goto("/");
  const structured = JSON.parse(
    await page.locator('script[type="application/ld+json"]').innerText(),
  );
  expect(
    structured["@graph"].map((x: { "@type": string }) => x["@type"]),
  ).toContain("SoftwareApplication");
  expect(JSON.stringify(structured)).not.toMatch(
    /aggregateRating|"offers"|"price"/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/features",
    "/pricing",
    "/contact",
    "/product-demo",
    "/guides/enquiry-to-booking",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/contact");
  await page.screenshot({
    path: "test-results/seo-contact-mobile.png",
    fullPage: true,
  });
});
test("crawler endpoints exclude private screens and authentication stays enforced", async ({
  request,
  page,
}) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((x) => x[1]);
  expect(urls.sort()).toEqual(
    publicPages.map((p) => origin + (p === "/" ? "" : p)).sort(),
  );
  const robots = await request.get("/robots.txt");
  const rules = await robots.text();
  for (const p of ["/workspace", "/api", "/admin", "/login", "/demo"])
    expect(rules).toContain(`Disallow: ${p}`);
  expect(rules).toContain(`Sitemap: ${origin}/sitemap.xml`);
  for (const p of [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/join",
    "/two-factor",
    "/demo",
  ]) {
    const r = await page.goto(p);
    expect(r?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  }
  const data = await request.get("/api/data");
  expect(data.status()).toBe(401);
  expect(data.headers()["x-robots-tag"]).toContain("noindex");
  const workspace = await request.get("/workspace", { maxRedirects: 0 });
  expect(workspace.headers()["x-robots-tag"]).toContain("noindex");
  // Next.js can redirect through a streamed meta refresh after sending HTTP 200.
  if (workspace.status() === 200) {
    expect(await workspace.text()).toMatch(
      /http-equiv="refresh"[^>]+content="[^"]*url=\/login/,
    );
  } else {
    expect([303, 307, 308]).toContain(workspace.status());
    expect(workspace.headers().location).toContain("/login");
  }
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
