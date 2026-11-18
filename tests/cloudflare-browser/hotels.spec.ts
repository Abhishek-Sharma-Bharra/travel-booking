import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
function localFixtureSql(sql: string) {
  return execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "TRAVELOS_DB",
      "--local",
      "--config",
      "cloudflare/worker/wrangler.jsonc",
      "--persist-to",
      ".local/cloudflare-state",
      "--command",
      sql,
      "--json",
    ],
    {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: "/workspace/.config",
        WRANGLER_LOG_PATH: ".local/cloudflare-logs",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}
test("hotel owner lists date inventory; ad guest reviews actual quote and saves a scoped temporary room hold", async ({
  page,
  browser,
}) => {
  const headers = { Origin: "http://localhost:3000" },
    email = `hotel-browser-${Date.now()}@test.invalid`;
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: {
      name: "Fictional Hotel Owner",
      email,
      password: "Fictional-hotel-browser-test-2026!",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const account = await signup.json();
  expect(account.user.id).toMatch(/^[A-Za-z0-9-]{1,100}$/);
  // LOCAL fixture only. Verified identity and independent review are tested with
  // real service/MFA checks in native tests; never use these SQL shortcuts live.
  localFixtureSql(
    `UPDATE "User" SET "emailVerified"=1 WHERE id='${account.user.id}' AND email='${email}'`,
  );
  const profile = {
    name: "Fictional Alpine Retreat",
    address: "123 Fictional Mountain Road",
    city: "Manali",
    region: "Himachal Pradesh",
    countryCode: "IN",
    postalCode: "175131",
    timezone: "Asia/Kolkata",
    contactEmail: "hotel@test.invalid",
    contactPhone: "+919876543210",
    amenities: ["Wi-Fi", "Parking"],
    photoUrls: [],
    policies: "Check-in at 14:00. Breakfast is not included in this rate.",
    cancellationPolicy:
      "Contact this hotel for cancellation. No automatic refund is promised.",
    taxBps: 1200,
  };
  const created = await page.request.post("/api/hotelier", {
    headers,
    data: { action: "create", profile },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const hotel = await created.json();
  const added = await page.request.post("/api/hotelier", {
    headers,
    data: {
      action: "room",
      hotelId: hotel.hotelId,
      revision: 0,
      room: {
        name: "Deluxe Mountain Room",
        description:
          "A mountain-facing room with Wi-Fi. Breakfast is excluded.",
        totalRooms: 2,
        maxAdults: 2,
        maxChildren: 1,
        maxOccupancy: 3,
        amenities: ["Wi-Fi"],
        active: true,
      },
    },
  });
  expect(added.ok(), await added.text()).toBeTruthy();
  expect(hotel.hotelId).toMatch(/^[A-Za-z0-9-]{1,100}$/);
  localFixtureSql(
    `UPDATE "Hotel" SET status='APPROVED',revision=revision+1 WHERE id='${hotel.hotelId}' AND name='Fictional Alpine Retreat'`,
  );
  await page.goto("/hotelier");
  await expect(
    page.getByRole("heading", { name: "Hotel owner workspace", exact: true }),
  ).toBeVisible();
  const start = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    end = new Date(Date.now() + 32 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("From date", { exact: true }).fill(start);
  await page.getByLabel("Until date (exclusive)", { exact: true }).fill(end);
  await page.getByLabel("Daily room allotment", { exact: true }).fill("2");
  await page
    .getByLabel("Rate per room/night (₹)", { exact: true })
    .fill("2500");
  await page.getByLabel(/I confirm these rates/).check();
  await page
    .getByRole("button", { name: "Save inventory and rates", exact: true })
    .click();
  await expect(
    page.getByText("Date-wise inventory and rates saved.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/hotel-owner-inventory.png",
    fullPage: true,
  });
  const guestContext = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    }),
    guest = await guestContext.newPage();
  await guest.goto(
    `/stays/${hotel.hotelId}?utm_source=meta&utm_campaign=hotel-browser-ad`,
  );
  await expect(
    guest.getByRole("heading", { name: profile.name, exact: true }),
  ).toBeVisible();
  await guest.getByLabel("Check-in", { exact: true }).fill(start);
  await guest.getByLabel("Check-out", { exact: true }).fill(end);
  await guest
    .getByRole("button", { name: "Check availability and price", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", {
      name: "Verified room quotation",
      exact: true,
    }),
  ).toBeVisible();
  await expect(guest.getByText("Total: ₹5,600", { exact: true })).toBeVisible();
  await guest.getByLabel(/Save my chat for 7 days/).check();
  await guest
    .getByLabel("Your message", { exact: true })
    .fill("Cancellation policy kya hai?");
  await guest
    .getByRole("button", { name: "Send to hotel guide", exact: true })
    .click();
  await expect(
    guest.getByText(profile.cancellationPolicy, { exact: false }).last(),
  ).toBeVisible();
  await guest
    .getByLabel("Your name", { exact: true })
    .fill("Fictional Hotel Guest");
  await guest
    .getByLabel("Phone with country code", { exact: true })
    .fill("+919876543210");
  await guest.getByLabel(/I agree to share my details/).check();
  await guest.getByLabel(/I reviewed the dates/).check();
  await guest
    .getByRole("button", { name: "Request temporary room hold", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Room request saved", exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByText(/This is not a confirmed booking/),
  ).toBeVisible();
  const capability = (await guestContext.cookies()).find((c) =>
    c.name.startsWith("hotel_guest_"),
  );
  expect(capability?.httpOnly).toBe(true);
  expect(
    await guest.evaluate(() => document.cookie.includes("hotel_guest_")),
  ).toBe(false);
  await guest.reload();
  await expect(guest.getByLabel("Check-in", { exact: true })).toHaveValue(
    start,
  );
  await expect(
    guest.getByText(profile.cancellationPolicy, { exact: false }).last(),
  ).toBeVisible();
  await expect(
    guest.getByRole("heading", { name: "Room request saved", exact: true }),
  ).toBeVisible();
  await guest.screenshot({
    path: "test-results/hotel-ad-guest-desktop.png",
    fullPage: true,
  });
  await guest.setViewportSize({ width: 390, height: 844 });
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await guest.screenshot({
    path: "test-results/hotel-ad-guest-mobile.png",
    fullPage: true,
  });
  const report = await (
    await page.request.get("/api/hotelier/booking?hotelId=" + hotel.hotelId)
  ).json();
  expect(report.reservations).toHaveLength(1);
  expect(report.reservations[0].status).toBe("HELD");
  expect(report.conversations).toHaveLength(1);
  expect(report.payments).toHaveLength(0);
  await guest
    .getByRole("button", { name: "Release my temporary hold", exact: true })
    .click();
  await expect(guest.getByText(/CANCELLED/)).toBeVisible();
  await guestContext.close();
});
