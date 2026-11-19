import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { requestResources, closeResources } from "../src/lib/request-resources";
import { db } from "../src/lib/db";
import {
  configureHotelMerchant,
  createHotelOrder,
  verifyHotelCheckout,
} from "../src/lib/hotels/payments";
import {
  registerBusiness,
  businessCommand,
  ownDashboard,
  publicSearch,
} from "../src/lib/marketplace/business";
import {
  bookingQuote,
  requestBooking,
  changeBooking,
} from "../src/lib/marketplace/bookings";
import { adminCommand, adminDashboard } from "../src/lib/marketplace/admin";
import { report } from "../src/lib/marketplace/report";
import { commission } from "../src/lib/marketplace/core";
import { mutateHotel, reviewHotel } from "../src/lib/hotels/service";
import { updateHotelInventory, hotelQuote } from "../src/lib/hotels/booking";
import type { Booking, Snapshot } from "../src/lib/marketplace/types";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("local test only")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "marketplace-tests" },
  }),
);
let binding: D1Database, operator: { id: string; token: string };
const old = { ...process.env };
async function scoped<T>(fn: () => Promise<T>, target = binding) {
  const resources = {
    databaseUrl: "",
    databaseEngine: "d1" as const,
    d1: target,
    values: new Map<symbol, unknown>(),
    cleanup: [] as (() => Promise<void>)[],
  };
  return requestResources.run(resources, async () => {
    try {
      return await fn();
    } finally {
      await closeResources(resources);
    }
  });
}
function countedDatabase() {
  let queries = 0;
  const raw = new WeakMap<object, object>();
  const wrap = (statement: object): object => {
    const proxy = new Proxy(statement, {
      get(target, key) {
        const method = Reflect.get(target, key);
        if (key === "bind")
          return (...args: unknown[]) => wrap(method.apply(target, args));
        if (["run", "all", "first", "raw"].includes(String(key)))
          return (...args: unknown[]) => {
            queries++;
            return method.apply(target, args);
          };
        return typeof method === "function" ? method.bind(target) : method;
      },
    });
    raw.set(proxy, statement);
    return proxy;
  };
  const proxy = new Proxy(binding, {
    get(target, key) {
      if (key === "prepare") return (sql: string) => wrap(target.prepare(sql));
      if (key === "batch")
        return (statements: object[]) => {
          queries += statements.length;
          return target.batch(
            statements.map((s) => raw.get(s) || s) as Parameters<
              D1Database["batch"]
            >[0],
          );
        };
      const result = Reflect.get(target, key);
      return typeof result === "function" ? result.bind(target) : result;
    },
  });
  return { db: proxy, queries: () => queries };
}
async function user(verified = true) {
  const agency = await db.agency.create({
    data: { name: "Fictional marketplace agency" },
  });
  return db.user.create({
    data: {
      id: randomUUID(),
      name: "Fictional Account",
      email: randomUUID() + "@test.invalid",
      emailVerified: verified,
      agencyId: agency.id,
      role: "OWNER",
    },
  });
}
before(async () => {
  process.env.HOTELS_ENABLED = "true";
  process.env.HOTEL_BOOKING_ENABLED = "true";
  binding = (await mf.getD1Database("DB")) as unknown as D1Database;
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const file of (await readdir("cloudflare/d1/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile("cloudflare/d1/migrations/" + file, "utf8"),
      ).map((sql) => binding.prepare(sql)),
    );
  await scoped(async () => {
    const admin = await user();
    await db.user.update({
      where: { id: admin.id },
      data: { twoFactorEnabled: true },
    });
    const token = randomUUID();
    await db.session.create({
      data: {
        id: randomUUID(),
        token,
        userId: admin.id,
        expiresAt: new Date(Date.now() + 86400000),
        mfaVerifiedAt: new Date(),
      },
    });
    operator = { id: admin.id, token };
    process.env.PLATFORM_ADMIN_EMAILS = admin.email;
  });
});
after(async () => {
  for (const key of [
    "HOTELS_ENABLED",
    "HOTEL_BOOKING_ENABLED",
    "PLATFORM_ADMIN_EMAILS",
  ]) {
    if (old[key] === undefined) delete process.env[key];
    else process.env[key] = old[key];
  }
  await mf.dispose();
});
const profile = {
  name: "Fictional charter operator",
  city: "Manali",
  address: "123 Fictional Operations Road",
  phone: "+919876543210",
  email: "supplier@test.invalid",
  registration: "FICTIONAL-BUS-REG-2026",
};
const vehicle = {
  name: "Fictional 35 seater",
  registration: "TEST-" + randomUUID().slice(0, 8),
  capacity: 35,
  pricing: "TRIP",
  ratePaise: 100000,
  minKm: 100,
  taxBps: 1800,
  policies:
    "Pay at supplier. Full bus trip; tolls excluded. Cancellation requires supplier review.",
  photos: [],
  active: true,
};
async function bus() {
  const owner = await user();
  const { businessId } = await registerBusiness(owner.id, {
    kind: "BUS",
    profile,
  });
  await businessCommand(owner.id, {
    action: "acceptAgreement",
    businessId,
    revision: 0,
    accepted: true,
  });
  await businessCommand(owner.id, {
    action: "submit",
    businessId,
    revision: 0,
  });
  await adminCommand(operator.id, operator.token, {
    action: "review",
    businessId,
    revision: 1,
    decision: "APPROVED",
    reason: "Fictional local business evidence reviewed",
    businessVerified: true,
  });
  await businessCommand(owner.id, {
    action: "vehicle",
    businessId,
    vehicle: { ...vehicle, registration: "TEST-" + randomUUID().slice(0, 8) },
  });
  const r = (await ownDashboard(owner.id)).businesses.find(
    (b) => b.id === businessId,
  )!;
  return { owner, businessId, vehicleId: String(r.vehicles[0].id) };
}
const day = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
function select(f: Awaited<ReturnType<typeof bus>>, channel = "MARKETPLACE") {
  return {
    businessId: f.businessId,
    vehicleId: f.vehicleId,
    start: day(2),
    end: day(3),
    route: "Delhi to Manali private charter",
    capacity: 35,
    km: 500,
    rooms: 1,
    adults: 2,
    children: 0,
    channel,
  };
}
async function requested(
  f: Awaited<ReturnType<typeof bus>>,
  buyer: Awaited<ReturnType<typeof user>>,
  channel = "MARKETPLACE",
) {
  if (channel === "AGENCY")
    await adminCommand(operator.id, operator.token, {
      action: "referral",
      businessId: f.businessId,
      agencyId: buyer.agencyId,
      status: "ACTIVE",
      reference: "Fictional independently verified supplier referral agreement",
    });
  const selection = select(f, channel),
    quote = await bookingQuote(buyer.id, selection);
  const payload = {
    selection,
    quoteToken: quote.quoteToken,
    requestKey: randomUUID(),
    customer: "Fictional Customer",
    phone: "+919876543211",
    email: "customer@test.invalid",
    consent: true,
  };
  const r = await requestBooking(buyer.id, payload);
  return { id: r.bookingId, payload };
}
async function row(id: string) {
  return (await binding
    .prepare("SELECT * FROM MPBooking WHERE id=?")
    .bind(id)
    .first<Booking>())!;
}
async function transition(
  owner: string,
  id: string,
  action: string,
  extra = {},
) {
  const r = await row(id);
  return changeBooking(owner, {
    bookingId: id,
    revision: r.revision,
    action,
    ...extra,
  });
}
test("private registration, verified review, contract acceptance and public search never expose private business/customer data", () =>
  scoped(async () => {
    const unverified = await user(false);
    const draft = await registerBusiness(unverified.id, {
      kind: "CAR",
      profile,
    });
    await assert.rejects(
      businessCommand(unverified.id, {
        action: "submit",
        businessId: draft.businessId,
        revision: 0,
      }),
      /Verify/,
    );
    assert.equal(
      (await ownDashboard(unverified.id)).businesses[0].status,
      "DRAFT",
    );
    const f = await bus(),
      outsider = await user();
    await assert.rejects(
      businessCommand(outsider.id, {
        action: "vehicle",
        businessId: f.businessId,
        vehicle,
      }),
      /not found/,
    );
    const publicData = await publicSearch({
      kind: "BUS",
      city: "Manali",
      start: day(2),
      end: day(3),
    });
    assert.ok(publicData.businesses.some((b) => b.id === f.businessId));
    assert.doesNotMatch(
      JSON.stringify(publicData),
      /supplier@test|9876543210|FICTIONAL-BUS-REG/,
    );
    await assert.rejects(
      adminDashboard(outsider.id, operator.token),
      /administrator/,
    );
    await assert.rejects(
      registerBusiness(outsider.id, {
        kind: "HOTEL",
        profile,
        hotelId: randomUUID(),
      }),
      /owner membership/,
    );
  }));
test("charter race reserves one vehicle, replay is scoped and no client paid/origin/price flags are accepted", () =>
  scoped(async () => {
    const f = await bus(),
      a = await user(),
      b = await user();
    const first = await requested(f, a),
      second = await requested(f, b);
    assert.equal(
      (await requestBooking(a.id, first.payload)).bookingId,
      first.id,
    );
    await assert.rejects(
      requestBooking(a.id, { ...first.payload, customer: "different" }),
      /Idempotency/,
    );
    await assert.rejects(
      requestBooking(a.id, {
        ...first.payload,
        origin: "DIRECT",
        paymentStatus: "PAID",
      }),
    );
    const race = await Promise.allSettled([
      transition(f.owner.id, first.id, "hold"),
      transition(f.owner.id, second.id, "hold"),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const held = (await row(first.id)).status === "HELD" ? first.id : second.id;
    await assert.rejects(
      transition(held === first.id ? a.id : b.id, held, "confirm"),
      /Supplier owner/,
    );
    await transition(f.owner.id, held, "confirm");
    assert.equal((await row(held)).paymentStatus, "UNPAID");
    assert.equal((await row(held)).status, "CONFIRMED");
    await assert.rejects(
      transition(f.owner.id, held, "complete"),
      /after its end/,
    );
    const data = await ownDashboard(b.id);
    assert.ok(data.bookings.every((r) => r.requesterId === b.id));
    await assert.rejects(
      binding
        .prepare("INSERT INTO MPBooking SELECT * FROM MPBooking WHERE id=?")
        .bind(held)
        .run(),
    );
  }));
test("blackouts, stale quotes, expiry, min-km billing, capacity and plan limits are enforced atomically", () =>
  scoped(async () => {
    const f = await bus(),
      buyer = await user();
    await businessCommand(f.owner.id, {
      action: "blackout",
      businessId: f.businessId,
      vehicleId: f.vehicleId,
      start: day(2),
      end: day(3),
      reason: "Maintenance",
    });
    await assert.rejects(bookingQuote(buyer.id, select(f)), /unavailable/);
    const d = await ownDashboard(f.owner.id);
    await businessCommand(f.owner.id, {
      action: "removeBlackout",
      businessId: f.businessId,
      blackoutId: d.businesses[0].blackouts[0].id,
    });
    const q = await bookingQuote(buyer.id, select(f));
    await businessCommand(f.owner.id, {
      action: "vehicle",
      businessId: f.businessId,
      vehicleId: f.vehicleId,
      revision: 0,
      vehicle: {
        ...vehicle,
        registration: "CHANGE-" + randomUUID().slice(0, 8),
        pricing: "KM",
        ratePaise: 1000,
        minKm: 200,
      },
    });
    await assert.rejects(
      requestBooking(buyer.id, {
        selection: select(f),
        quoteToken: q.quoteToken,
        requestKey: randomUUID(),
        customer: "Fictional",
        phone: "+919876543211",
        email: "",
        consent: true,
      }),
      /Quote changed/,
    );
    const km = await bookingQuote(buyer.id, { ...select(f), km: 100 });
    assert.equal(km.subtotal, 200000);
    await assert.rejects(
      bookingQuote(buyer.id, { ...select(f), capacity: 36 }),
      /capacity/,
    );
    const r = await requested(f, buyer);
    await transition(f.owner.id, r.id, "hold");
    await binding
      .prepare(
        "UPDATE MPBooking SET holdUntil=?,revision=revision+1 WHERE id=?",
      )
      .bind(new Date(Date.now() - 1000).toISOString(), r.id)
      .run();
    await assert.rejects(transition(f.owner.id, r.id, "confirm"), /unexpired/);
    await transition(f.owner.id, r.id, "expire");
    assert.equal((await row(r.id)).status, "EXPIRED");
    await bookingQuote(buyer.id, select(f));
    await binding
      .prepare(
        "UPDATE MPSubscription SET status='PAUSED',revision=revision+1 WHERE id=?",
      )
      .bind(f.businessId)
      .run();
    await assert.rejects(bookingQuote(buyer.id, select(f)), /inactive/);
  }));
test("driver assignments cannot overlap across two vehicles", () =>
  scoped(async () => {
    const f = await bus(),
      buyer = await user();
    await businessCommand(f.owner.id, {
      action: "vehicle",
      businessId: f.businessId,
      vehicle: {
        ...vehicle,
        registration: "SECOND-" + randomUUID().slice(0, 8),
      },
    });
    await businessCommand(f.owner.id, {
      action: "driver",
      businessId: f.businessId,
      name: "Fictional Driver",
      phone: "+919876543212",
      licenseReference: "FICTIONAL-LICENSE",
    });
    const data = (await ownDashboard(f.owner.id)).businesses[0];
    const secondVehicle = String(
      data.vehicles.find((v) => v.id !== f.vehicleId)!.id,
    );
    const a = await requested(f, buyer),
      b = await requested({ ...f, vehicleId: secondVehicle }, buyer);
    await transition(f.owner.id, a.id, "hold");
    await transition(f.owner.id, b.id, "hold");
    const driver = String(data.drivers[0].id);
    const results = await Promise.allSettled([
      transition(f.owner.id, a.id, "driver", { driverId: driver }),
      transition(f.owner.id, b.id, "driver", { driverId: driver }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  }));
test("commission snapshots, source eligibility, externally verified records, refunds and settlement retries preserve exact balances", () =>
  scoped(async () => {
    const plan = (await adminDashboard(operator.id, operator.token)).plans.find(
      (p) => p.id === "BUS",
    )!;
    const config = {
      monthlyPaise: 99900,
      requestLimit: 500,
      resourceLimit: 20,
      commissionBps: 200,
      platformBps: 7000,
      agencyBps: 2000,
      supplierBps: 1000,
      basis: "NET_TOTAL",
    };
    await adminCommand(operator.id, operator.token, {
      action: "plan",
      kind: "BUS",
      revision: plan.revision,
      config,
    });
    const f = await bus(),
      buyer = await user();
    const booking = await requested(f, buyer);
    await transition(f.owner.id, booking.id, "hold");
    await transition(f.owner.id, booking.id, "confirm");
    await binding
      .prepare("UPDATE MPBooking SET start=?,end=? WHERE id=?")
      .bind(day(-1), day(0), booking.id)
      .run();
    await transition(f.owner.id, booking.id, "complete");
    const entry = await binding
      .prepare("SELECT * FROM MPCommission WHERE bookingId=?")
      .bind(booking.id)
      .first<{
        commission: number;
        platform: number;
        agency: number;
        supplier: number;
      }>();
    assert.deepEqual(
      [entry!.commission, entry!.platform, entry!.agency, entry!.supplier],
      [2000, 1400, 400, 200],
    );
    await assert.rejects(
      binding
        .prepare("UPDATE MPCommission SET commission=0 WHERE bookingId=?")
        .bind(booking.id)
        .run(),
      /immutable/,
    );
    let current = await row(booking.id);
    await adminCommand(operator.id, operator.token, {
      action: "paymentRecord",
      bookingId: booking.id,
      revision: current.revision,
      eventKey: randomUUID(),
      amount: current.total,
      reference: "Fictional externally verified bank receipt",
    });
    current = await row(booking.id);
    const settlement = {
      action: "settlement",
      bookingId: booking.id,
      revision: current.revision,
      eventKey: randomUUID(),
      party: "PLATFORM",
      direction: "COLLECTED",
      amount: 1400,
      reference: "Fictional external settlement receipt",
    };
    await adminCommand(operator.id, operator.token, settlement);
    assert.equal(
      (await adminCommand(operator.id, operator.token, settlement)).replayed,
      true,
    );
    current = await row(booking.id);
    const refund = {
      action: "refundRecord",
      bookingId: booking.id,
      revision: current.revision,
      eventKey: randomUUID(),
      refundedNet: 25000,
      refundedTax: 4500,
      reference: "Fictional external refund verified",
    };
    await adminCommand(operator.id, operator.token, refund);
    assert.equal(
      (await adminCommand(operator.id, operator.token, refund)).replayed,
      true,
    );
    const balance = (
      await adminDashboard(operator.id, operator.token)
    ).balances.find((r) => r.id === booking.id)!;
    assert.equal(balance.platformDue, -350);
    current = await row(booking.id);
    await adminCommand(operator.id, operator.token, {
      action: "settlement",
      bookingId: booking.id,
      revision: current.revision,
      eventKey: randomUUID(),
      party: "PLATFORM",
      direction: "RETURNED",
      amount: 350,
      reference: "Fictional verified external return",
    });
    current = await row(booking.id);
    await adminCommand(operator.id, operator.token, {
      action: "refundRecord",
      bookingId: booking.id,
      revision: current.revision,
      eventKey: randomUUID(),
      refundedNet: 100000,
      refundedTax: 18000,
      reference: "Fictional full external refund",
    });
    assert.equal((await row(booking.id)).status, "REFUNDED");
    const total = await binding
      .prepare(
        "SELECT SUM(commission) total FROM MPCommission WHERE bookingId=?",
      )
      .bind(booking.id)
      .first<{ total: number }>();
    assert.equal(total!.total, 0);
    const direct = await bookingQuote(f.owner.id, select(f, "DIRECT"));
    assert.equal(direct.commissionEligible, false);
    await assert.rejects(
      bookingQuote(buyer.id, select(f, "AGENCY")),
      /referral agreement/,
    );
    await adminCommand(operator.id, operator.token, {
      action: "referral",
      businessId: f.businessId,
      agencyId: buyer.agencyId,
      status: "ACTIVE",
      reference: "Fictional independently verified supplier referral agreement",
    });
    const referral = await bookingQuote(buyer.id, select(f, "AGENCY"));
    assert.equal(referral.commissionEligible, false);
    const outsider = await user();
    const csv = await report(
      outsider.id,
      new URLSearchParams({ kind: "BOOKINGS", from: day(-1), to: day(1) }),
    );
    assert.doesNotMatch(csv.csv, new RegExp(booking.id));
    const supplierCsv = await report(
      f.owner.id,
      new URLSearchParams({ kind: "COMMISSION", from: day(-1), to: day(1) }),
    );
    assert.match(supplierCsv.csv, new RegExp(booking.id));
  }));
test("hotel marketplace hold shares the existing atomic nightly inventory and rolls back a failed marketplace write", () =>
  scoped(async () => {
    const owner = await user(),
      buyer = await user();
    const h = await mutateHotel(owner.id, {
      action: "create",
      profile: {
        region: "Himachal Pradesh",
        countryCode: "IN",
        postalCode: "175131",
        timezone: "Asia/Kolkata",
        contactEmail: profile.email,
        contactPhone: profile.phone,
        amenities: [],
        photoUrls: [],
        policies: "Check in after 14:00 and check out before 11:00.",
        cancellationPolicy:
          "Contact the supplier for approved cancellation review.",
        taxBps: 1200,
        name: "Fictional Marketplace Hotel",
        address: profile.address,
        city: profile.city,
      },
    });
    await mutateHotel(owner.id, {
      action: "room",
      hotelId: h.hotelId,
      revision: 0,
      room: {
        name: "Deluxe",
        description: "Fictional room for local tests",
        totalRooms: 1,
        maxAdults: 2,
        maxChildren: 1,
        maxOccupancy: 3,
        amenities: [],
        active: true,
      },
    });
    await mutateHotel(owner.id, {
      action: "submit",
      hotelId: h.hotelId,
      revision: 1,
    });
    await reviewHotel(operator.id, operator.token, {
      hotelId: h.hotelId,
      revision: 2,
      decision: "APPROVED",
      businessVerified: true,
      reason: "Fictional local verification evidence",
    });
    const room = (
      await db.hotelRoomCategory.findMany({ where: { hotelId: h.hotelId } })
    )[0];
    await updateHotelInventory(owner.id, h.hotelId, {
      roomId: room.id,
      from: day(1),
      to: day(31),
      allotment: 1,
      ratePaise: 10000,
      minStay: 1,
      closed: false,
      confirmed: true,
    });
    const m = await registerBusiness(owner.id, {
      kind: "HOTEL",
      hotelId: h.hotelId,
      profile,
    });
    await businessCommand(owner.id, {
      action: "acceptAgreement",
      businessId: m.businessId,
      revision: 0,
      accepted: true,
    });
    await businessCommand(owner.id, {
      action: "submit",
      businessId: m.businessId,
      revision: 0,
    });
    await adminCommand(operator.id, operator.token, {
      action: "review",
      businessId: m.businessId,
      revision: 1,
      decision: "APPROVED",
      businessVerified: true,
      reason: "Fictional hotel business approved",
    });
    await adminCommand(operator.id, operator.token, {
      action: "referral",
      businessId: m.businessId,
      agencyId: buyer.agencyId,
      status: "ACTIVE",
      reference: "Fictional approved hotel agency referral relationship",
    });
    const selection = {
      businessId: m.businessId,
      roomId: room.id,
      start: day(1),
      end: day(31),
      route: "Agency guest hotel stay",
      capacity: 2,
      km: 1,
      rooms: 1,
      adults: 2,
      children: 0,
      channel: "AGENCY",
    };
    const q = await bookingQuote(buyer.id, selection);
    const request = await requestBooking(buyer.id, {
      selection,
      quoteToken: q.quoteToken,
      requestKey: randomUUID(),
      customer: "Fictional Hotel Guest",
      phone: "+919876543211",
      email: "",
      consent: true,
    });
    await binding
      .prepare(
        `CREATE TRIGGER MPTestRollback BEFORE UPDATE ON MPBooking WHEN NEW.id='${request.bookingId}' AND NEW.status='HELD' BEGIN SELECT RAISE(ABORT,'fictional induced failure'); END`,
      )
      .run();
    await assert.rejects(transition(owner.id, request.bookingId, "hold"));
    assert.equal(
      (await binding
        .prepare(
          'SELECT COUNT(*) n FROM "HotelStayRequest" WHERE "requestId"=?',
        )
        .bind(request.bookingId)
        .first<{ n: number }>())!.n,
      0,
    );
    await binding.prepare("DROP TRIGGER MPTestRollback").run();
    const meter = countedDatabase();
    await scoped(
      () => transition(owner.id, request.bookingId, "hold"),
      meter.db,
    );
    assert.ok(
      meter.queries() <= 40,
      "30-night marketplace hotel hold service query budget: " +
        meter.queries(),
    );
    const held = await row(request.bookingId);
    assert.equal(held.status, "HELD");
    assert.ok(held.hotelStayId);
    const { hotelAccess } = await import("../src/lib/marketplace/hotel-access");
    const access = await hotelAccess(buyer.id, request.bookingId);
    assert.equal(access.hotelId, h.hotelId);
    await assert.rejects(
      hotelAccess(owner.id, request.bookingId),
      /belonging to your account/,
    );

    await assert.rejects(
      hotelQuote(h.hotelId, {
        roomId: room.id,
        checkIn: day(1),
        checkOut: day(31),
        rooms: 1,
        adults: 2,
        children: 0,
      }),
      /Not enough/,
    );
    await assert.rejects(
      transition(owner.id, request.bookingId, "confirm"),
      /provider-verified/,
    );
    await transition(owner.id, request.bookingId, "cancel");
    await hotelQuote(h.hotelId, {
      roomId: room.id,
      checkIn: day(1),
      checkOut: day(31),
      rooms: 1,
      adults: 2,
      children: 0,
    });
    // Isolated live-mode CONTRACT test: transport is mocked, no external API or
    // money is used, and the approval flag is restored immediately afterwards.
    const nextQuote = await bookingQuote(buyer.id, selection);
    const nextRequest = await requestBooking(buyer.id, {
      selection,
      quoteToken: nextQuote.quoteToken,
      requestKey: randomUUID(),
      customer: "Fictional Payment Guest",
      phone: "+919876543211",
      email: "",
      consent: true,
    });
    await transition(owner.id, nextRequest.bookingId, "hold");
    const capability = await hotelAccess(buyer.id, nextRequest.bookingId);
    const previous = {
      flag: process.env.HOTEL_LIVE_PAYMENTS_APPROVED,
      key: process.env.INTEGRATION_ACTIVE_KEY,
      map: process.env.INTEGRATION_ENCRYPTION_KEYS,
    };
    process.env.HOTEL_LIVE_PAYMENTS_APPROVED = "true";
    process.env.INTEGRATION_ACTIVE_KEY = "fixture";
    process.env.INTEGRATION_ENCRYPTION_KEYS = JSON.stringify({
      fixture: "12".repeat(32),
    });
    try {
      await db.user.update({
        where: { id: owner.id },
        data: { twoFactorEnabled: true },
      });
      const token = randomUUID();
      await db.session.create({
        data: {
          id: randomUUID(),
          token,
          userId: owner.id,
          expiresAt: new Date(Date.now() + 3600000),
          mfaVerifiedAt: new Date(),
        },
      });
      const keySecret = "fictional-marketplace-merchant-secret";
      await configureHotelMerchant(owner.id, token, h.hotelId, {
        keyId: "rzp_live_MarketplaceFixture123",
        keySecret,
        webhookSecret: "fictional-marketplace-webhook-secret",
        authorized: true,
      });
      const orderId = "order_" + randomUUID().replace(/-/g, ""),
        paymentId = "pay_" + randomUUID().replace(/-/g, "");
      let amount = 0,
        receipt = "",
        posts = 0;
      const transport: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/orders") && init?.method === "POST") {
          posts++;
          const body = JSON.parse(String(init.body));
          amount = body.amount;
          receipt = body.receipt;
          return Response.json({ id: orderId, amount, currency: "INR" });
        }
        if (url.endsWith("/orders/" + orderId))
          return Response.json({
            id: orderId,
            amount,
            currency: "INR",
            receipt,
          });
        if (url.endsWith("/payments/" + paymentId))
          return Response.json({
            id: paymentId,
            order_id: orderId,
            amount,
            currency: "INR",
            status: "captured",
          });
        throw Error("Unexpected mocked payment endpoint");
      };
      await createHotelOrder(
        h.hotelId,
        capability.secret,
        { confirmed: true },
        transport,
      );
      const callback = {
        orderId,
        paymentId,
        signature: createHmac("sha256", keySecret)
          .update(orderId + "|" + paymentId)
          .digest("hex"),
      };
      await verifyHotelCheckout(
        h.hotelId,
        capability.secret,
        callback,
        transport,
      );
      const confirmed = await row(nextRequest.bookingId);
      assert.equal(confirmed.status, "CONFIRMED");
      assert.equal(confirmed.paymentStatus, "PROVIDER_VERIFIED");
      await verifyHotelCheckout(
        h.hotelId,
        capability.secret,
        callback,
        transport,
      );
      assert.equal(
        (await row(nextRequest.bookingId)).revision,
        confirmed.revision,
      );
      assert.equal(posts, 1);
    } finally {
      for (const [key, v] of [
        ["HOTEL_LIVE_PAYMENTS_APPROVED", previous.flag],
        ["INTEGRATION_ACTIVE_KEY", previous.key],
        ["INTEGRATION_ENCRYPTION_KEYS", previous.map],
      ] as const) {
        if (v === undefined) delete process.env[key];
        else process.env[key] = v;
      }
    }
  }));
test("rounding never produces negative shares and full net refunds reverse all eligible commission", () => {
  const snapshot = {
    eligible: true,
    hasAgency: true,
    agreement: {
      commissionBps: 10000,
      platformBps: 0,
      agencyBps: 5000,
      supplierBps: 5000,
      basis: "NET_AFTER_DISCOUNT",
    },
  } as Snapshot;
  const split = commission(
    { subtotal: 1, discount: 0, refundedNet: 0, origin: "MARKETPLACE" },
    snapshot,
  );
  assert.equal(split.platform + split.agency + split.supplier, 1);
  assert.ok(split.platform >= 0 && split.agency >= 0 && split.supplier >= 0);
  assert.equal(
    commission(
      {
        subtotal: 1000,
        discount: 100,
        refundedNet: 900,
        origin: "MARKETPLACE",
      },
      snapshot,
    ).commission,
    0,
  );
});

test("monthly request/resource quotas and expired admin MFA fail closed without partial writes", () =>
  scoped(async () => {
    const f = await bus(),
      buyer = await user();
    await requested(f, buyer);
    const p = await binding
      .prepare("SELECT * FROM MPPlan WHERE id='BUS'")
      .first<Record<string, number | string>>();
    await binding
      .prepare(
        "UPDATE MPPlan SET requestLimit=1,resourceLimit=1,revision=revision+1 WHERE id='BUS'",
      )
      .run();
    try {
      await assert.rejects(requested(f, buyer), /limit reached/);
      await assert.rejects(
        businessCommand(f.owner.id, {
          action: "vehicle",
          businessId: f.businessId,
          vehicle: { ...vehicle, registration: "LIMIT-TEST" },
        }),
        /plan limit/,
      );
    } finally {
      await binding
        .prepare(
          "UPDATE MPPlan SET requestLimit=?,resourceLimit=?,revision=revision+1 WHERE id='BUS'",
        )
        .bind(p!.requestLimit, p!.resourceLimit)
        .run();
    }
    await db.session.update({
      where: { token: operator.token },
      data: { mfaVerifiedAt: new Date(Date.now() - 5 * 3600000) },
    });
    try {
      await assert.rejects(
        adminDashboard(operator.id, operator.token),
        /authenticator again/,
      );
    } finally {
      await db.session.update({
        where: { token: operator.token },
        data: { mfaVerifiedAt: new Date() },
      });
    }
  }));
test("agency subscription activation is opt-in, keeps its existing capacity plan and synchronizes CRM access", () =>
  scoped(async () => {
    const agencyOwner = await user();
    await db.agency.update({
      where: { id: agencyOwner.agencyId! },
      data: { subscription: "Paused", plan: "Growth" },
    });
    const business = await registerBusiness(agencyOwner.id, {
      kind: "AGENCY",
      profile,
    });
    await adminCommand(operator.id, operator.token, {
      action: "subscription",
      businessId: business.businessId,
      revision: 0,
      status: "ACTIVE",
      days: 30,
      reference: "Fictional agreed opt-in agency subscription",
    });
    const agency = await db.agency.findUniqueOrThrow({
      where: { id: agencyOwner.agencyId! },
    });
    assert.equal(agency.subscription, "Active");
    assert.equal(agency.plan, "Growth");
    assert.ok(agency.subscriptionExpiresAt! > new Date());
  }));
test("calendar is supplier-isolated and marks held, blocked and free dates without customer details", () =>
  scoped(async () => {
    const { vehicleCalendar } = await import("../src/lib/marketplace/calendar");
    const f = await bus(),
      buyer = await user();
    const b = await requested(f, buyer);
    await transition(f.owner.id, b.id, "hold");
    const data = await vehicleCalendar(f.owner.id, {
      businessId: f.businessId,
      vehicleId: f.vehicleId,
      month: day(2).slice(0, 7),
    });
    assert.equal(data.days.find((d) => d.day === day(2))!.status, "HELD");
    assert.doesNotMatch(JSON.stringify(data), /Fictional Customer|9876543211/);
    await assert.rejects(
      vehicleCalendar(buyer.id, {
        businessId: f.businessId,
        vehicleId: f.vehicleId,
        month: day(2).slice(0, 7),
      }),
      /not found/,
    );
  }));

test("moving an agency member revokes access to previous agency requests and exports", () =>
  scoped(async () => {
    const f = await bus(),
      buyer = await user();
    const booking = await requested(f, buyer, "AGENCY");
    const other = await db.agency.create({
      data: { name: "Fictional second agency" },
    });
    await db.user.update({
      where: { id: buyer.id },
      data: { agencyId: other.id, role: "AGENT" },
    });
    assert.equal(
      (await ownDashboard(buyer.id)).bookings.some((r) => r.id === booking.id),
      false,
    );
    await assert.rejects(
      transition(buyer.id, booking.id, "cancel"),
      /not found/,
    );
    await assert.rejects(
      requestBooking(buyer.id, booking.payload),
      /not found/,
    );
    const csv = await report(
      buyer.id,
      new URLSearchParams({ kind: "BOOKINGS", from: day(-1), to: day(1) }),
    );
    assert.doesNotMatch(csv.csv, new RegExp(booking.id));
  }));

test("car rentals use their own plan, full-vehicle capacity and kilometer minimum with 3 percent eligible commission", () =>
  scoped(async () => {
    const owner = await user(),
      buyer = await user();
    const business = await registerBusiness(owner.id, {
      kind: "CAR",
      profile: { ...profile, name: "Fictional Car Rental" },
    });
    await businessCommand(owner.id, {
      action: "acceptAgreement",
      businessId: business.businessId,
      revision: 0,
      accepted: true,
    });
    await businessCommand(owner.id, {
      action: "submit",
      businessId: business.businessId,
      revision: 0,
    });
    await adminCommand(operator.id, operator.token, {
      action: "review",
      businessId: business.businessId,
      revision: 1,
      decision: "APPROVED",
      reason: "Fictional verified car rental evidence",
      businessVerified: true,
    });
    await businessCommand(owner.id, {
      action: "vehicle",
      businessId: business.businessId,
      vehicle: {
        ...vehicle,
        name: "Fictional 5 seat car",
        registration: "CAR-" + randomUUID().slice(0, 8),
        capacity: 5,
        pricing: "KM",
        ratePaise: 1500,
        minKm: 100,
      },
    });
    const data = (await ownDashboard(owner.id)).businesses[0];
    assert.equal(data.subscription!.monthlyPaise, 79900);
    const selection = {
      businessId: business.businessId,
      vehicleId: String(data.vehicles[0].id),
      start: day(2),
      end: day(3),
      route: "Delhi local car rental",
      capacity: 4,
      km: 80,
      channel: "MARKETPLACE",
    };
    const q = await bookingQuote(buyer.id, selection);
    assert.equal(q.subtotal, 150000);
    assert.equal(q.total, 177000);
    await assert.rejects(
      bookingQuote(buyer.id, { ...selection, capacity: 6 }),
      /capacity/,
    );
    const booking = await requestBooking(buyer.id, {
      selection,
      quoteToken: q.quoteToken,
      requestKey: randomUUID(),
      customer: "Fictional Car Guest",
      phone: "+919876543211",
      email: "",
      consent: true,
    });
    await transition(owner.id, booking.bookingId, "hold");
    await transition(owner.id, booking.bookingId, "confirm");
    await binding
      .prepare("UPDATE MPBooking SET start=?,end=? WHERE id=?")
      .bind(day(-1), day(0), booking.bookingId)
      .run();
    await transition(owner.id, booking.bookingId, "complete");
    const ledger = await binding
      .prepare("SELECT commission FROM MPCommission WHERE bookingId=?")
      .bind(booking.bookingId)
      .first<{ commission: number }>();
    assert.equal(ledger!.commission, 4500);
  }));
