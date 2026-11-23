import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3000";
async function signup(page: Page) {
  const address = "198.51.100." + (20 + Math.floor(Math.random() * 200));
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": address,
    "CF-Connecting-IP": address,
  });
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: {
      name: "Phase Two Test Owner",
      email: `p2-${Date.now()}-${Math.random().toString(16).slice(2)}@test.invalid`,
      password: "Fictional-phase-two-2026!",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const result = await response.json();
  return result.user as { id: string };
}
async function act(page: Page, action: string, input: unknown) {
  const r = await page.request.post("/api/action", {
    headers: { Origin: origin },
    data: { action, input },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function nav(page: Page, name: string) {
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  const mobile = await toggle.isVisible();
  if (mobile) await toggle.click();
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
function sql(command: string) {
  execFileSync(
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
      command,
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
test("agency itinerary saves, restores versions, quotes exact costing, shows customer history and prints safe travel documents", async ({
  page,
}) => {
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Workspace tour", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Skip tour", exact: true })
        .click();
    },
  );
  const user = await signup(page);
  await act(page, "package", {
    name: "P2 Kerala Journey",
    destination: "Kerala",
    days: 2,
    itinerary: "Arrival and hotel transfer after supplier review.",
    inclusions: "Hotel and transfer",
    exclusions: "Flights",
    paymentTerms: "Deposit under agreed package terms",
    cancellationTerms: "Refunds require manual review",
    price: "10000",
    estimatedCost: "5000",
  });
  await act(page, "lead", {
    lead: {
      externalId: "P2-" + Date.now(),
      customer: "Phase Two Traveller",
      email: "traveller@test.invalid",
      phone: "+919876543210",
      destination: "Kerala",
      enquiryDate: "2026-11-22",
      travelStart: "2026-12-01",
      travelEnd: "2026-12-02",
      travellers: 2,
      budget: "20000",
      quotedPrice: "0",
      source: "Website",
      assignedId: user.id,
      stage: "New",
    },
  });
  await page.goto("/workspace");
  await nav(page, "Itineraries & costing");
  await page
    .getByRole("button", { name: "New itinerary from package", exact: true })
    .click();
  await expect(page.getByLabel("Itinerary title", { exact: true })).toHaveValue(
    "P2 Kerala Journey",
  );
  await page
    .getByRole("button", { name: "Add cost item", exact: true })
    .click();
  await page.getByLabel("Unit cost ₹", { exact: true }).fill("1000");
  await page.getByLabel("Markup %", { exact: true }).fill("20");
  await page.getByLabel("Tax %", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Version saved");
  await expect(
    page.getByRole("button", { name: "Save version", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Itinerary title", { exact: true })
    .fill("P2 Revised Journey");
  await page.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Version saved");
  const history = page.getByRole("combobox", {
    name: "Version history",
    exact: true,
  });
  await expect(history.locator("option")).toHaveCount(3);
  await history.selectOption({
    label: (await history.locator("option").last().textContent()) || "",
  });
  await expect(
    page.getByText("Historical version · read only", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Itinerary title", { exact: true })).toHaveValue(
    "P2 Kerala Journey",
  );
  await history.selectOption("current");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".ops-print-document")).toBeVisible();
  await expect(page.locator(".ops-private-costs")).toBeHidden();
  await page.pdf({ path: "test-results/p2-itinerary.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel(/I reviewed this saved version/).check();
  await page
    .getByRole("button", {
      name: "Create itemized draft quotation",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Quotations", exact: true }),
  ).toBeVisible();
  let data = await (await page.request.get("/api/data")).json();
  expect(data.quotes).toHaveLength(1);
  expect(data.quotes[0].total).toBe(126000);
  expect(data.quotes[0].proposal).toContain("Itemized selling amounts");
  expect(data.quotes[0].proposal).not.toMatch(/supplier cost|markup/i);
  await nav(page, "Customers");
  await page
    .getByRole("button", { name: /Phase Two Traveller.*Kerala/ })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Phase Two Traveller · history",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Quotation version 1 created", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/p2-customers.png",
    fullPage: true,
  });
  const booking = await act(page, "accept", {
    id: data.quotes[0].id,
    dueDate: "2026-12-01",
  });
  await page.reload();
  await nav(page, "Bookings");
  await page
    .getByRole("button", { name: "Travel document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Booking summary", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/not a supplier confirmation voucher/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Booking travel document" }),
  ).toBeHidden();
  await act(page, "transaction", {
    bookingId: booking.bookingId,
    requestId: crypto.randomUUID(),
    kind: "Receipt",
    amount: "1260",
    date: "2026-11-22",
    memo: "Fictional manual receipt",
  });
  await act(page, "booking", {
    id: booking.bookingId,
    status: "Confirmed",
    supplierStatus: "Confirmed",
    cancellationFee: "0",
  });
  await page.reload();
  await nav(page, "Bookings");
  await page
    .getByRole("button", { name: "Travel document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agency travel voucher", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/does not independently verify bank payment/),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "test-results/p2-travel-voucher.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await page.keyboard.press("Escape");
  await nav(page, "Payments");
  await expect(
    page.getByRole("cell", { name: "Receipt", exact: true }),
  ).toBeVisible();
  await nav(page, "Expenses");
  await expect(
    page.getByRole("cell", { name: "Receipt", exact: true }),
  ).toHaveCount(0);
  await nav(page, "Departure calendar");
  await page.getByLabel("Travel month", { exact: true }).fill("2026-12");
  await expect(
    page.getByText("Departure · Phase Two Traveller", { exact: true }),
  ).toBeVisible();
  await nav(page, "Demand planning");
  await expect(page.getByText(/56 recorded days/)).toBeVisible();
  await nav(page, "Business advisor");
  await expect(
    page.getByRole("heading", { name: "Due follow-ups", exact: true }),
  ).toBeVisible();
  await nav(page, "AI Travel Agent");
  await expect(
    page.getByRole("heading", { name: "AI Travel Agent tools", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create from customer message", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enter manually", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await nav(page, "Customers");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/p2-customers-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("bus/car workspace selects matching owned business and serves scoped operational reports", async ({
  page,
}) => {
  const user = await signup(page);
  expect(user.id).toMatch(/^[\w-]+$/);
  const ads = await (await page.request.get("/api/integrations")).json();
  expect(ads.availability.enabled).toBe(false);
  expect(ads.configured).toEqual({ META: false, GOOGLE: false });
  expect(ads.availability.note).toContain("Continue recording spend manually");
  sql(`UPDATE "User" SET "emailVerified"=1 WHERE id='${user.id}'`);
  const profile = {
    name: "P2 Bus Business",
    city: "Delhi",
    address: "123 Fictional Operations Road",
    phone: "+919876543210",
    email: "bus@test.invalid",
    registration: "FICTIONAL-P2",
  };
  for (const kind of ["BUS", "CAR"]) {
    const r = await page.request.post("/api/marketplace", {
      headers: { Origin: origin },
      data: {
        action: "register",
        payload: {
          kind,
          profile: {
            ...profile,
            name: kind === "BUS" ? "P2 Bus Business" : "P2 Car Business",
          },
        },
      },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }
  await page.goto("/operator?kind=CAR");
  await expect(
    page.getByRole("heading", { name: "P2 Car Business", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Fleet operations & reports",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No active fleet", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Fleet & pricing", exact: true }),
  ).toHaveAttribute("href", "#operator-fleet");
  const assistant = page.getByRole("region", {
    name: "Business operational assistant",
    exact: true,
  });
  await assistant
    .getByRole("button", { name: "Recorded revenue", exact: true })
    .click();
  await assistant
    .getByRole("button", { name: "Ask about records", exact: true })
    .click();
  await expect(
    assistant.getByRole("heading", {
      name: "Your recorded business snapshot",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    assistant.getByText("Recorded direct contribution · not net profit", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    assistant
      .getByRole("log", { name: "Business conversation" })
      .locator("article"),
  ).toHaveCount(1);
  await page.getByLabel("Trip start month", { exact: true }).fill("2026-01");
  await expect(
    assistant
      .getByRole("log", { name: "Business conversation" })
      .locator("article"),
  ).toHaveCount(0);
  const crossOrigin = await page.request.post("/api/assistant/business", {
    headers: { Origin: "https://other.example" },
    data: {
      kind: "TRANSPORT",
      businessId: "unknown",
      month: "2026-11",
      question: "summary",
    },
  });
  expect(crossOrigin.status()).toBe(403);
  const guestContext = await page.context().browser()!.newContext();
  try {
    const denied = await guestContext.request.post(
      origin + "/api/assistant/business",
      {
        headers: { Origin: origin },
        data: {
          kind: "TRANSPORT",
          businessId: "unknown",
          month: "2026-11",
          question: "summary",
        },
      },
    );
    expect(denied.status()).toBe(401);
    expect(denied.headers()["cache-control"]).toContain("no-store");
  } finally {
    await guestContext.close();
  }
  await page.screenshot({
    path: "test-results/p2-car-dashboard.png",
    fullPage: true,
  });
  await page.goto("/operator?kind=BUS");
  await expect(
    page.getByRole("heading", { name: "P2 Bus Business", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("hotel workspace shows guest operations, preserves confirmed inventory through check-out, and labels insufficient forecasts", async ({
  page,
}) => {
  const user = await signup(page);
  expect(user.id).toMatch(/^[\w-]+$/);
  sql(`UPDATE "User" SET "emailVerified"=1 WHERE id='${user.id}'`);
  const headers = { Origin: origin };
  let r = await page.request.post("/api/hotelier", {
    headers,
    data: {
      action: "create",
      profile: {
        name: "P2 Fictional Hotel",
        address: "123 Fictional Hotel Road",
        city: "Delhi",
        region: "Delhi",
        countryCode: "IN",
        postalCode: "110001",
        timezone: "Asia/Kolkata",
        contactEmail: "hotel@test.invalid",
        contactPhone: "+919876543210",
        amenities: ["Wi-Fi"],
        photoUrls: [],
        policies:
          "Check-in subject to guest identity and confirmed reservation review.",
        cancellationPolicy:
          "Cancellation requires hotel review. No automatic refunds.",
        taxBps: 500,
      },
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const { hotelId } = await r.json();
  expect(hotelId).toMatch(/^[\w-]+$/);
  r = await page.request.post("/api/hotelier", {
    headers,
    data: {
      action: "room",
      hotelId,
      revision: 0,
      room: {
        name: "P2 Room",
        description: "Fictional guest operations room",
        totalRooms: 2,
        maxAdults: 2,
        maxChildren: 1,
        maxOccupancy: 3,
        amenities: [],
        active: true,
      },
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const overview = await (await page.request.get("/api/hotelier")).json(),
    roomId = overview.hotels.find((h: { id: string }) => h.id === hotelId)
      .rooms[0].id;
  expect(roomId).toMatch(/^[\w-]+$/);
  const start = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    }),
    end = new Date(Date.parse(start) + 86400000).toISOString().slice(0, 10),
    stayId = crypto.randomUUID();
  // Local-only fixture simulates an already provider-verified stay; real payment callbacks are tested separately.
  sql(
    `UPDATE "Hotel" SET status='APPROVED',revision=revision+1 WHERE id='${hotelId}'; INSERT INTO "HotelRoomNight" ("hotelId","roomId",day,allotment,"ratePaise") VALUES ('${hotelId}','${roomId}','${start}',2,100000); INSERT INTO "HotelStayRequest" (id,"hotelId","roomId","requestId","requestHash","secretHash","checkIn","checkOut",rooms,adults,children,customer,phone,email,subtotal,tax,total,"termsSnapshot","consentAt","holdUntil",status,"paymentStatus","createdAt",revision) VALUES ('${stayId}','${hotelId}','${roomId}','${crypto.randomUUID()}','local-fixture','${crypto.randomUUID()}','${start}','${end}',1,2,0,'P2 Fictional Guest','+919876543210','guest@test.invalid',100000,5000,105000,'Local fixture terms',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'CONFIRMED','VERIFIED',strftime('%Y-%m-%dT%H:%M:%fZ','now'),0); INSERT INTO "HotelStayNight" ("stayId","hotelId","roomId",day,rooms,"ratePaise") VALUES ('${stayId}','${hotelId}','${roomId}','${start}',1,100000);`,
  );
  await page.goto("/hotelier");
  await expect(
    page.getByRole("heading", {
      name: "Reservations, guests & performance",
      exact: true,
    }),
  ).toBeVisible();
  const assistant = page.getByRole("region", {
    name: "Business operational assistant",
    exact: true,
  });
  await assistant
    .getByRole("button", { name: "Booked occupancy", exact: true })
    .click();
  await assistant
    .getByRole("button", { name: "Ask about records", exact: true })
    .click();
  await expect(assistant.getByText("50.0%", { exact: true })).toBeVisible();
  await expect(
    assistant.getByRole("log", { name: "Business conversation" }),
  ).not.toContainText("guest@test.invalid");
  await assistant
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(
    assistant
      .getByRole("log", { name: "Business conversation" })
      .locator("article"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Guest records", exact: true })
    .click();
  await expect(
    page
      .locator("#hotel-guest-operations")
      .getByRole("cell", { name: /P2 Fictional Guest/ }),
  ).toBeVisible();
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByText(/Guest check-in recorded/)).toBeVisible();
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await expect(page.getByText(/Guest check-out recorded/)).toBeVisible();
  await page
    .getByRole("button", { name: "Occupancy calendar", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "50.0%", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revenue & outlook", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Booked occupancy planning",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/70 consecutive configured past nights/),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/p2-hotel-operations.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
