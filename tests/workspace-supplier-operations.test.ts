import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { requestResources, closeResources } from "../src/lib/request-resources";
import { db } from "../src/lib/db";
import {
  hotelGuestCommand,
  hotelOperationsOverview,
} from "../src/lib/hotels/operations";
import { transportOperations } from "../src/lib/marketplace/operations";
import {
  registerBusiness,
  businessCommand,
  ownDashboard,
} from "../src/lib/marketplace/business";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "supplier-operations-tests" },
  }),
);
let binding: D1Database;
const old = { ...process.env };
before(async () => {
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  process.env.WORKSPACE_OPERATIONS_ENABLED = "true";
  process.env.HOTELS_ENABLED = "true";
  process.env.HOTEL_BOOKING_ENABLED = "true";
  binding = await mf.getD1Database("DB");
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const f of (await readdir("cloudflare/d1/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile("cloudflare/d1/migrations/" + f, "utf8"),
      ).map((s) => binding.prepare(s)),
    );
});
after(async () => {
  for (const k of [
    "WORKSPACE_OPERATIONS_ENABLED",
    "HOTELS_ENABLED",
    "HOTEL_BOOKING_ENABLED",
  ]) {
    if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  }
  await mf.dispose();
});
async function scoped<T>(fn: () => Promise<T>) {
  const r = {
    databaseUrl: "",
    databaseEngine: "d1" as const,
    d1: binding,
    values: new Map<symbol, unknown>(),
    cleanup: [] as (() => Promise<void>)[],
  };
  return requestResources.run(r, async () => {
    try {
      return await fn();
    } finally {
      await closeResources(r);
    }
  });
}
async function insert(table: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  await binding
    .prepare(
      `INSERT INTO ${table} (${keys.map((k) => '"' + k + '"').join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    )
    .bind(...Object.values(fields))
    .run();
}
const day = (n = 0) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function user() {
  return db.user.create({
    data: {
      id: randomUUID(),
      name: "Fictional workspace owner",
      email: randomUUID() + "@test.invalid",
      emailVerified: true,
    },
  });
}
async function hotel() {
  const owner = await user(),
    other = await user(),
    viewer = await user(),
    h = await db.hotel.create({
      data: {
        name: "Fictional hotel",
        status: "APPROVED",
        timezone: "UTC",
        taxBps: 500,
      },
    }),
    r = await db.hotelRoomCategory.create({
      data: {
        hotelId: h.id,
        name: "Standard",
        totalRooms: 10,
        maxAdults: 2,
        maxChildren: 1,
        maxOccupancy: 3,
      },
    });
  await db.hotelMember.create({
    data: { hotelId: h.id, userId: owner.id, role: "OWNER" },
  });
  await db.hotelMember.create({
    data: { hotelId: h.id, userId: viewer.id, role: "VIEWER" },
  });
  return { owner, other, viewer, h, r };
}
async function stay(
  f: Awaited<ReturnType<typeof hotel>>,
  overrides: Record<string, unknown> = {},
) {
  const id = randomUUID();
  await insert('"HotelStayRequest"', {
    id,
    hotelId: f.h.id,
    roomId: f.r.id,
    requestId: randomUUID(),
    requestHash: "fixture",
    secretHash: randomUUID(),
    checkIn: day(),
    checkOut: day(2),
    rooms: 1,
    adults: 2,
    children: 0,
    customer: "Fictional Guest",
    phone: "+919876543210",
    email: "guest@test.invalid",
    subtotal: 100000,
    tax: 5000,
    total: 105000,
    termsSnapshot: "Fixture terms",
    consentAt: new Date().toISOString(),
    holdUntil: new Date(Date.now() + 3600000).toISOString(),
    status: "CONFIRMED",
    paymentStatus: "VERIFIED",
    createdAt: new Date().toISOString(),
    revision: 0,
    ...overrides,
  });
  return id;
}
const check = (hotelId: string, stayId: string, action = "CHECK_IN") => ({
  hotelId,
  stayId,
  action,
  revision: 0,
  requestId: randomUUID(),
  reviewed: true,
});
test("hotel guest operations deny unrelated users, viewers, holds, sandbox payments and out-of-window check-ins", () =>
  scoped(async () => {
    const f = await hotel(),
      id = await stay(f);
    await assert.rejects(
      hotelGuestCommand(f.other.id, check(f.h.id, id)),
      /not found|permission/,
    );
    await assert.rejects(
      hotelOperationsOverview(f.viewer.id, f.h.id, day().slice(0, 7)),
      /not found|permission/,
    );
    for (const overrides of [
      { status: "HELD", paymentStatus: "NOT_INITIATED" },
      { status: "SANDBOX_COMPLETED", paymentStatus: "SANDBOX_VERIFIED" },
      { checkIn: day(1), checkOut: day(3) },
    ]) {
      const s = await stay(f, overrides);
      await assert.rejects(
        hotelGuestCommand(f.owner.id, check(f.h.id, s)),
        /confirmed|date window/,
      );
    }
    await assert.rejects(
      hotelGuestCommand(f.owner.id, check(f.h.id, id, "CHECK_OUT")),
      /check-in first/,
    );
  }));
test("hotel check-in/out is payload-bound, immutable, concurrent-safe and leaves booked nights and payment untouched", () =>
  scoped(async () => {
    const f = await hotel(),
      id = await stay(f),
      cmd = check(f.h.id, id);
    await insert('"HotelRoomNight"', {
      hotelId: f.h.id,
      roomId: f.r.id,
      day: day(),
      allotment: 10,
      ratePaise: 100000,
    });
    await insert('"HotelStayNight"', {
      stayId: id,
      hotelId: f.h.id,
      roomId: f.r.id,
      day: day(),
      rooms: 1,
      ratePaise: 100000,
    });
    assert.equal((await hotelGuestCommand(f.owner.id, cmd)).replayed, false);
    assert.equal((await hotelGuestCommand(f.owner.id, cmd)).replayed, true);
    await assert.rejects(
      hotelGuestCommand(f.owner.id, { ...cmd, action: "CHECK_OUT" }),
      /key already used/,
    );
    await assert.rejects(
      hotelGuestCommand(f.owner.id, check(f.h.id, id)),
      /already been recorded/,
    );
    // Editing a hotel profile must not trap an already checked-in guest.
    await db.hotel.update({ where: { id: f.h.id }, data: { status: "DRAFT" } });
    const results = await Promise.allSettled([
      hotelGuestCommand(f.owner.id, check(f.h.id, id, "CHECK_OUT")),
      hotelGuestCommand(f.owner.id, check(f.h.id, id, "CHECK_OUT")),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const report = await hotelOperationsOverview(
      f.owner.id,
      f.h.id,
      day().slice(0, 7),
    );
    assert.equal(report.guests.length, 1);
    assert.ok(report.guests[0].checkedOutAt);
    assert.equal(report.nights[0].booked, 1);
    assert.equal(report.nights[0].allotment, 10);
    assert.equal(report.revenue?.gross, 0);
    const row = await binding
      .prepare(
        'SELECT status,"paymentStatus",revision FROM "HotelStayRequest" WHERE id=?',
      )
      .bind(id)
      .first();
    assert.deepEqual(row, {
      status: "CONFIRMED",
      paymentStatus: "VERIFIED",
      revision: 0,
    });
    await assert.rejects(
      binding
        .prepare('DELETE FROM "HotelGuestStayEvent" WHERE "stayId"=?')
        .bind(id)
        .run(),
      /immutable/,
    );
    await db.user.update({
      where: { id: f.owner.id },
      data: { disabled: true },
    });
    await assert.rejects(
      hotelOperationsOverview(f.owner.id, f.h.id, day().slice(0, 7)),
      /enabled account/,
    );
  }));
test("hotel and transport operations are disabled until their paired workspace rollout", () =>
  scoped(async () => {
    process.env.WORKSPACE_OPERATIONS_ENABLED = "false";
    try {
      await assert.rejects(
        hotelOperationsOverview("unknown", "unknown", day().slice(0, 7)),
        /not enabled/,
      );
      await assert.rejects(
        transportOperations("unknown", "unknown", day().slice(0, 7)),
        /not enabled/,
      );
    } finally {
      process.env.WORKSPACE_OPERATIONS_ENABLED = "true";
    }
  }));
test("transport report scopes selected owned business, excludes taxes from net sales and counts whole vehicle-days once", () =>
  scoped(async () => {
    const owner = await user(),
      other = await user(),
      profile = {
        name: "Fictional charter",
        city: "Delhi",
        address: "123 Fictional Test Road",
        phone: "+919876543210",
        email: "bus@test.invalid",
        registration: "TEST-BUS",
      };
    const bus = await registerBusiness(owner.id, { kind: "BUS", profile }),
      car = await registerBusiness(owner.id, {
        kind: "CAR",
        profile: { ...profile, name: "Fictional cars" },
      });
    for (const businessId of [bus.businessId, car.businessId])
      await businessCommand(owner.id, {
        action: "vehicle",
        businessId,
        vehicle: {
          name: "Test vehicle",
          registration: randomUUID(),
          capacity: 35,
          pricing: "TRIP",
          ratePaise: 100000,
          minKm: 100,
          taxBps: 500,
          policies: "Supplier-reviewed test terms. No payment executed.",
          photos: [],
          active: true,
        },
      });
    const dash = await ownDashboard(owner.id);
    assert.equal(dash.operationsEnabled, true);
    const vehicleId = String(
      dash.businesses.find((b) => b.id === bus.businessId)!.vehicles[0].id,
    );
    const input = {
      businessId: bus.businessId,
      requesterId: other.id,
      requestKey: randomUUID(),
      payloadHash: "fixture",
      origin: "DIRECT",
      vehicleId,
      start: day(),
      end: day(1),
      route: "Delhi charter",
      capacity: 35,
      km: 100,
      customer: "Fictional Guest",
      phone: "+919876543210",
      email: "guest@test.invalid",
      consentAt: new Date().toISOString(),
      status: "CONFIRMED",
      paymentStatus: "EXTERNALLY_VERIFIED",
      subtotal: 100000,
      discount: 10000,
      tax: 4500,
      total: 94500,
      refundedNet: 1000,
      refundedTax: 50,
      expense: 40000,
      snapshot: "{}",
      createdAt: new Date().toISOString(),
    };
    await insert("MPBooking", { id: randomUUID(), ...input });
    const report = await transportOperations(
      owner.id,
      bus.businessId,
      day().slice(0, 7),
    );
    assert.equal(report.summary?.bookedNet, 89000);
    assert.equal(report.summary?.verifiedCollections, 93450);
    assert.equal(report.summary?.expenses, 40000);
    assert.equal(report.days.find((d) => d.day === day())?.occupied, 1);
    assert.equal(report.days.find((d) => d.day === day(1))?.occupied, 0);
    assert.equal(
      (await transportOperations(owner.id, car.businessId, day().slice(0, 7)))
        .summary?.requests,
      0,
    );
    await assert.rejects(
      transportOperations(other.id, bus.businessId, day().slice(0, 7)),
      /not found/,
    );
  }));

test("an open guest stay prevents cancellation or full refund even after the workspace UI is disabled", () =>
  scoped(async () => {
    const { adminCommand } = await import("../src/lib/marketplace/admin");
    const f = await hotel(),
      stayId = await stay(f);
    await hotelGuestCommand(f.owner.id, check(f.h.id, stayId));
    const staff = await user(),
      token = randomUUID();
    await db.user.update({
      where: { id: staff.id },
      data: { twoFactorEnabled: true },
    });
    await db.session.create({
      data: {
        id: randomUUID(),
        token,
        userId: staff.id,
        expiresAt: new Date(Date.now() + 3600000),
        mfaVerifiedAt: new Date(),
      },
    });
    const before = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = staff.email;
    try {
      const business = await registerBusiness(f.owner.id, {
          kind: "HOTEL",
          hotelId: f.h.id,
          profile: {
            name: "Fictional hotel marketplace",
            city: "Delhi",
            address: "123 Fictional Hotel Road",
            phone: "+919876543210",
            email: "hotel@test.invalid",
            registration: "TEST-HOTEL",
          },
        }),
        id = randomUUID();
      await insert("MPBooking", {
        id,
        businessId: business.businessId,
        requesterId: f.other.id,
        requestKey: randomUUID(),
        payloadHash: "fixture",
        origin: "MARKETPLACE",
        hotelStayId: stayId,
        start: day(),
        end: day(2),
        route: "Hotel stay",
        capacity: 2,
        km: 1,
        customer: "Fictional Guest",
        phone: "+919876543210",
        email: "guest@test.invalid",
        consentAt: new Date().toISOString(),
        status: "CONFIRMED",
        paymentStatus: "PROVIDER_VERIFIED",
        subtotal: 100000,
        discount: 0,
        tax: 5000,
        total: 105000,
        snapshot: "{}",
        createdAt: new Date().toISOString(),
      });
      process.env.WORKSPACE_OPERATIONS_ENABLED = "false";
      await assert.rejects(
        adminCommand(staff.id, token, {
          action: "cancel",
          bookingId: id,
          revision: 0,
          eventKey: randomUUID(),
          reference: "Fictional refund review reference",
          refundReviewed: true,
        }),
        /guest check-out/,
      );
      await assert.rejects(
        adminCommand(staff.id, token, {
          action: "refundRecord",
          bookingId: id,
          revision: 0,
          eventKey: randomUUID(),
          refundedNet: 100000,
          refundedTax: 5000,
          reference: "Fictional documented provider refund",
        }),
        /guest check-out/,
      );
      assert.equal(
        (
          await binding
            .prepare("SELECT status FROM MPBooking WHERE id=?")
            .bind(id)
            .first<{ status: string }>()
        )?.status,
        "CONFIRMED",
      );
    } finally {
      process.env.WORKSPACE_OPERATIONS_ENABLED = "true";
      if (before === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
      else process.env.PLATFORM_ADMIN_EMAILS = before;
    }
  }));
