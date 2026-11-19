import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { requestResources, closeResources } from "../src/lib/request-resources";
import { db } from "../src/lib/db";
import {
  mutateHotel,
  hotelOverview,
  reviewHotel,
} from "../src/lib/hotels/service";
import {
  updateHotelInventory,
  hotelQuote,
  holdHotelRoom,
  hotelStayStatus,
  hotelBookingOverview,
  publicHotel,
  cancelHotelHold,
} from "../src/lib/hotels/booking";
import {
  hotelChat,
  hotelAiEndpoint,
  hotelChatSnapshot,
} from "../src/lib/hotels/agent";
import {
  configureHotelMerchant,
  createHotelOrder,
  verifyHotelCheckout,
  hotelPaymentWebhook,
  reconcileHotelOrder,
} from "../src/lib/hotels/payments";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "hotel-booking-tests" },
  }),
);
let binding: D1Database;
const old = { ...process.env };
async function scoped<T>(fn: () => Promise<T>) {
  const scope = {
    databaseUrl: "",
    databaseEngine: "d1" as const,
    d1: binding,
    values: new Map<symbol, unknown>(),
    cleanup: [] as (() => Promise<void>)[],
  };
  return requestResources.run(scope, async () => {
    try {
      return await fn();
    } finally {
      await closeResources(scope);
    }
  });
}
before(async () => {
  process.env.PAID_AI_ENABLED = "true";
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  process.env.HOTELS_ENABLED = "true";
  process.env.HOTEL_BOOKING_ENABLED = "true";
  delete process.env.HOTEL_AI_API_KEY;
  delete process.env.AI_API_KEY;
  binding = (await mf.getD1Database("DB")) as unknown as D1Database;
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const file of (await readdir("cloudflare/d1/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile("cloudflare/d1/migrations/" + file, "utf8"),
      ).map((s) => binding.prepare(s)),
    );
});
after(async () => {
  for (const k of [
    "PAID_AI_ENABLED",
    "HOTELS_ENABLED",
    "HOTEL_BOOKING_ENABLED",
    "HOTEL_AI_API_KEY",
    "AI_API_KEY",
    "PLATFORM_ADMIN_EMAILS",
    "HOTEL_AI_GATEWAY_BASE_URL",
  ]) {
    if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  }
  await mf.dispose();
});
const profile = {
  name: "Fictional Snow Hotel",
  address: "123 Fictional Snow Road",
  city: "Manali",
  region: "Himachal Pradesh",
  countryCode: "IN",
  postalCode: "175131",
  timezone: "Asia/Kolkata",
  contactEmail: "hotel@test.invalid",
  contactPhone: "+919876543210",
  amenities: ["Wi-Fi"],
  photoUrls: [],
  policies: "Check in at 14:00. Breakfast is not included in the room rate.",
  cancellationPolicy:
    "Contact the hotel for cancellation. No automatic refund is promised.",
  taxBps: 1200,
};
const room = {
  name: "Deluxe",
  description: "Mountain-facing room. No breakfast included.",
  totalRooms: 1,
  maxAdults: 2,
  maxChildren: 1,
  maxOccupancy: 3,
  amenities: ["Wi-Fi"],
  active: true,
};
async function user(verified = true) {
  const id = randomUUID(),
    agency = await db.agency.create({
      data: { name: "Hotel account fixture" },
    });
  return db.user.create({
    data: {
      id,
      name: "Hotel Owner",
      email: id + "@test.invalid",
      emailVerified: verified,
      agencyId: agency.id,
      role: "OWNER",
    },
  });
}
async function fixture() {
  const owner = await user();
  const h = await mutateHotel(owner.id, { action: "create", profile });
  await mutateHotel(owner.id, {
    action: "room",
    hotelId: h.hotelId,
    revision: 0,
    room,
  });
  const hotel = (await hotelOverview(owner.id)).hotels[0];
  const staff = await user();
  await db.user.update({
    where: { id: staff.id },
    data: { twoFactorEnabled: true },
  });
  process.env.PLATFORM_ADMIN_EMAILS = staff.email;
  const token = randomUUID();
  await db.session.create({
    data: {
      id: randomUUID(),
      token,
      userId: staff.id,
      expiresAt: new Date(Date.now() + 3600000),
      mfaVerifiedAt: new Date(),
    },
  });
  await mutateHotel(owner.id, {
    action: "submit",
    hotelId: hotel.id,
    revision: 1,
  });
  await reviewHotel(staff.id, token, {
    hotelId: hotel.id,
    revision: 2,
    decision: "APPROVED",
    reason: "Fictional independent business verification only for this test.",
    businessVerified: true,
  });
  const start = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    end = new Date(Date.now() + 32 * 86400000).toISOString().slice(0, 10),
    stay = {
      roomId: hotel.rooms[0].id,
      checkIn: start,
      checkOut: end,
      rooms: 1,
      adults: 2,
      children: 0,
    };
  return { owner, hotelId: hotel.id, stay };
}
async function rates(f: Awaited<ReturnType<typeof fixture>>) {
  return updateHotelInventory(f.owner.id, f.hotelId, {
    roomId: f.stay.roomId,
    from: f.stay.checkIn,
    to: f.stay.checkOut,
    allotment: 1,
    ratePaise: 250000,
    minStay: 1,
    closed: false,
    confirmed: true,
  });
}
function request(
  stay: Awaited<ReturnType<typeof fixture>>["stay"],
  quoteToken: string,
) {
  return {
    stay,
    quoteToken,
    requestId: randomUUID(),
    customer: "Fictional Guest",
    phone: "+919876543210",
    email: "",
    consent: true,
    confirmed: true,
    attribution: { source: "meta", campaign: "snow-ad" },
  };
}
test("D1 hotel drafts allow unverified identity; submission requires verification; approval, published facts and inventory are hotel-scoped", () =>
  scoped(async () => {
    const unverified = await user(false);
    const draft = await mutateHotel(unverified.id, {
      action: "create",
      profile,
    });
    assert.equal(draft.status, "DRAFT");
    assert.equal((await hotelOverview(unverified.id)).emailVerified, false);
    await assert.rejects(
      mutateHotel(unverified.id, {
        action: "submit",
        hotelId: draft.hotelId,
        revision: 0,
      }),
      /verified/,
    );
    await assert.rejects(publicHotel(draft.hotelId), /not available/);
    await assert.rejects(
      hotelBookingOverview(unverified.id, draft.hotelId),
      /verified/,
    );
    const f = await fixture(),
      outsider = await user();
    await assert.rejects(
      hotelBookingOverview(outsider.id, f.hotelId),
      /Hotel not found/,
    );
    await assert.rejects(hotelQuote(f.hotelId, f.stay), /not available/);
    await rates(f);
    const q = await hotelQuote(f.hotelId, f.stay);
    assert.equal(q.subtotal, 500000);
    assert.equal(q.tax, 60000);
    assert.equal(q.total, 560000);
    assert.equal(q.availableRooms, 1);
    assert.equal((await publicHotel(f.hotelId)).rooms.length, 1);
    await assert.rejects(
      hotelQuote(f.hotelId, { ...f.stay, adults: 4 }),
      /occupancy/,
    );
    await assert.rejects(
      updateHotelInventory(outsider.id, f.hotelId, {
        roomId: f.stay.roomId,
        from: f.stay.checkIn,
        to: f.stay.checkOut,
        allotment: 1,
        ratePaise: 100,
        minStay: 1,
        closed: false,
        confirmed: true,
      }),
      /Hotel not found/,
    );
  }));
test("concurrent last-room requests produce one atomic hold, replay is scoped, expiry releases capacity and inventory cannot oversell", () =>
  scoped(async () => {
    const f = await fixture();
    await rates(f);
    const q = await hotelQuote(f.hotelId, f.stay),
      a = request(f.stay, q.quoteToken),
      b = request(f.stay, q.quoteToken);
    const result = await Promise.allSettled([
      holdHotelRoom(f.hotelId, a),
      holdHotelRoom(f.hotelId, b),
    ]);
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    const index = result.findIndex((r) => r.status === "fulfilled"),
      saved = (
        result[index] as PromiseFulfilledResult<
          Awaited<ReturnType<typeof holdHotelRoom>>
        >
      ).value;
    assert.equal(saved.confirmed, false);
    assert.equal(saved.paymentStatus, "NOT_INITIATED");
    assert.equal(
      (await holdHotelRoom(f.hotelId, index === 0 ? a : b, saved.secret)).id,
      saved.id,
    );
    await assert.rejects(
      hotelStayStatus("another-hotel", saved.secret),
      /not found/,
    );
    await assert.rejects(hotelQuote(f.hotelId, f.stay), /Not enough rooms/);
    await assert.rejects(
      updateHotelInventory(f.owner.id, f.hotelId, {
        roomId: f.stay.roomId,
        from: f.stay.checkIn,
        to: f.stay.checkOut,
        allotment: 0,
        ratePaise: 250000,
        minStay: 1,
        closed: false,
        confirmed: true,
      }),
      /Existing holds/,
    );
    await binding
      .prepare('UPDATE "HotelStayRequest" SET "holdUntil"=? WHERE id=?')
      .bind("2020-01-01T00:00:00.000Z", saved.id)
      .run();
    assert.equal(
      (await hotelStayStatus(f.hotelId, saved.secret)).status,
      "EXPIRED",
    );
    assert.equal((await hotelQuote(f.hotelId, f.stay)).availableRooms, 1);
    assert.equal(
      (await hotelBookingOverview(f.owner.id, f.hotelId)).reservations.length,
      1,
    );
  }));
test("stale prices and partial failed writes cannot create holds or consume inventory", () =>
  scoped(async () => {
    const f = await fixture();
    await rates(f);
    const q = await hotelQuote(f.hotelId, f.stay);
    await binding
      .prepare(
        'UPDATE "HotelRoomNight" SET "ratePaise"="ratePaise"+100,revision=revision+1 WHERE "hotelId"=?',
      )
      .bind(f.hotelId)
      .run();
    await assert.rejects(
      holdHotelRoom(f.hotelId, request(f.stay, q.quoteToken)),
      /Prices or terms changed/,
    );
    const fresh = await hotelQuote(f.hotelId, f.stay);
    await binding
      .prepare(
        "CREATE TRIGGER fail_hotel_hold BEFORE INSERT ON \"HotelStayNight\" BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
      )
      .run();
    await assert.rejects(
      holdHotelRoom(f.hotelId, request(f.stay, fresh.quoteToken)),
      /database operation/,
    );
    await binding.prepare("DROP TRIGGER fail_hotel_hold").run();
    assert.equal(
      (await hotelBookingOverview(f.owner.id, f.hotelId)).reservations.length,
      0,
    );
    assert.equal((await hotelQuote(f.hotelId, f.stay)).availableRooms, 1);
  }));
test("Hindi/English saved hotel guide uses backend facts, preserves scoped history, and Gateway rejects arbitrary hosts", () =>
  scoped(async () => {
    const f = await fixture();
    await rates(f);
    const first = await hotelChat(f.hotelId, {
      message: "Cancellation policy kya hai?",
      storageConsent: true,
      aiConsent: false,
      stay: f.stay,
    });
    assert.equal(first.aiUsed, false);
    assert.equal(first.messages.at(-1)?.content, profile.cancellationPolicy);
    const next = await hotelChat(
      f.hotelId,
      {
        message: "Please help me book this room",
        storageConsent: true,
        aiConsent: false,
        stay: f.stay,
      },
      first.secret,
    );
    assert.equal(next.messages.length, 4);
    const restored = await hotelChatSnapshot(f.hotelId, first.secret);
    assert.equal(restored.messages.length, 4);
    assert.deepEqual(restored.stay, f.stay);
    assert.equal(next.quote?.total, 560000);
    assert.match(next.messages.at(-1)!.content, /not active/);
    assert.equal(
      (await hotelBookingOverview(f.owner.id, f.hotelId)).conversations.length,
      1,
    );
    process.env.HOTEL_AI_GATEWAY_BASE_URL = "https://evil.example/openai";
    assert.throws(hotelAiEndpoint, /invalid/);
    process.env.HOTEL_AI_GATEWAY_BASE_URL =
      "https://gateway.ai.cloudflare.com/v1/" +
      "a".repeat(32) +
      "/travelos/openai";
    assert.equal(
      hotelAiEndpoint(),
      process.env.HOTEL_AI_GATEWAY_BASE_URL + "/chat/completions",
    );
    delete process.env.HOTEL_AI_GATEWAY_BASE_URL;
  }));

test("room holds release explicitly and expired chat data is redacted without removing guest records", () =>
  scoped(async () => {
    const f = await fixture();
    await rates(f);
    const q = await hotelQuote(f.hotelId, f.stay);
    const saved = await holdHotelRoom(f.hotelId, request(f.stay, q.quoteToken));
    assert.equal(
      (await cancelHotelHold(f.hotelId, saved.secret, { confirmed: true }))
        .status,
      "CANCELLED",
    );
    assert.equal((await hotelQuote(f.hotelId, f.stay)).availableRooms, 1);
    const chat = await hotelChat(
      f.hotelId,
      {
        message: "Hotel policies please",
        storageConsent: true,
        aiConsent: false,
      },
      saved.secret,
    );
    await binding
      .prepare('UPDATE "HotelChatSession" SET "expiresAt"=? WHERE "hotelId"=?')
      .bind("2020-01-01T00:00:00.000Z", f.hotelId)
      .run();
    await publicHotel(f.hotelId);
    const row = await binding
      .prepare(
        'SELECT messages,memory,status FROM "HotelChatSession" WHERE "hotelId"=?',
      )
      .bind(f.hotelId)
      .first<{ messages: string; memory: string; status: string }>();
    assert.deepEqual(row, { messages: "[]", memory: "{}", status: "REDACTED" });
    assert.equal(
      (await hotelBookingOverview(f.owner.id, f.hotelId)).reservations.length,
      1,
    );
    assert.ok(chat.secret);
  }));
test("Gateway AI uses only the configured provider endpoint with caching skipped and enforces hotel usage ceiling", () =>
  scoped(async () => {
    const f = await fixture();
    await rates(f);
    const originalFetch = globalThis.fetch;
    const oldKey = process.env.HOTEL_AI_API_KEY,
      oldGateway = process.env.HOTEL_AI_GATEWAY_BASE_URL,
      oldToken = process.env.HOTEL_AI_GATEWAY_TOKEN;
    process.env.HOTEL_AI_API_KEY = "fictional-provider-key";
    process.env.HOTEL_AI_GATEWAY_BASE_URL =
      "https://gateway.ai.cloudflare.com/v1/" +
      "b".repeat(32) +
      "/hotel-agent/openai";
    process.env.HOTEL_AI_GATEWAY_TOKEN = "fictional-gateway-key";
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++;
      assert.equal(
        String(input),
        process.env.HOTEL_AI_GATEWAY_BASE_URL + "/chat/completions",
      );
      const h = new Headers(init?.headers);
      assert.equal(h.get("cf-aig-skip-cache"), "true");
      assert.equal(
        h.get("cf-aig-authorization"),
        "Bearer fictional-gateway-key",
      );
      assert.equal(h.get("Authorization"), "Bearer fictional-provider-key");
      return Response.json({
        choices: [
          { message: { content: JSON.stringify({ intent: "booking" }) } },
        ],
      });
    };
    try {
      const result = await hotelChat(f.hotelId, {
        message: "Book a room please",
        storageConsent: true,
        aiConsent: true,
        stay: f.stay,
      });
      assert.equal(result.aiUsed, true);
      assert.equal(result.quote?.total, 560000);
      assert.match(result.messages.at(-1)!.content, /not active/);
      await binding
        .prepare('UPDATE "HotelAiUsage" SET calls=100 WHERE "hotelId"=?')
        .bind(f.hotelId)
        .run();
      const limited = await hotelChat(
        f.hotelId,
        { message: "Book this room", storageConsent: true, aiConsent: true },
        result.secret,
      );
      assert.equal(calls, 1);
      assert.equal(limited.aiUsed, false);
      assert.match(limited.messages.at(-1)!.content, /hotel team/);
      assert.equal(
        (await hotelBookingOverview(f.owner.id, f.hotelId)).reservations.length,
        0,
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const [k, v] of [
        ["HOTEL_AI_API_KEY", oldKey],
        ["HOTEL_AI_GATEWAY_BASE_URL", oldGateway],
        ["HOTEL_AI_GATEWAY_TOKEN", oldToken],
      ] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }));

const merchantSecret = "fictional-hotel-key-secret";
const webhookSecret = "fictional-hotel-webhook-secret";
async function paymentFixture(
  mode: "test" | "live",
  fn: (
    f: Awaited<ReturnType<typeof fixture>>,
    saved: Awaited<ReturnType<typeof holdHotelRoom>>,
  ) => Promise<void>,
) {
  const previous = {
    key: process.env.INTEGRATION_ACTIVE_KEY,
    map: process.env.INTEGRATION_ENCRYPTION_KEYS,
    live: process.env.HOTEL_LIVE_PAYMENTS_APPROVED,
  };
  process.env.INTEGRATION_ACTIVE_KEY = "test";
  process.env.INTEGRATION_ENCRYPTION_KEYS = JSON.stringify({
    test: "12".repeat(32),
  });
  try {
    const f = await fixture();
    await rates(f);
    let sessionToken = "test-session";
    if (mode === "live") {
      process.env.HOTEL_LIVE_PAYMENTS_APPROVED = "true";
      await db.user.update({
        where: { id: f.owner.id },
        data: { twoFactorEnabled: true },
      });
      sessionToken = randomUUID();
      await db.session.create({
        data: {
          id: randomUUID(),
          token: sessionToken,
          userId: f.owner.id,
          expiresAt: new Date(Date.now() + 3600000),
          mfaVerifiedAt: new Date(),
        },
      });
    }
    await configureHotelMerchant(f.owner.id, sessionToken, f.hotelId, {
      keyId: "rzp_" + mode + "_HotelFixture123",
      keySecret: merchantSecret,
      webhookSecret,
      authorized: true,
    });
    const quote = await hotelQuote(f.hotelId, f.stay),
      saved = await holdHotelRoom(f.hotelId, request(f.stay, quote.quoteToken));
    await fn(f, saved);
  } finally {
    for (const [k, v] of [
      ["INTEGRATION_ACTIVE_KEY", previous.key],
      ["INTEGRATION_ENCRYPTION_KEYS", previous.map],
      ["HOTEL_LIVE_PAYMENTS_APPROVED", previous.live],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
function razorpayTransport() {
  let posts = 0,
    receipt = "",
    amount = 0;
  const orderId = "order_" + randomUUID().replace(/-/g, ""),
    paymentId = "pay_" + randomUUID().replace(/-/g, "");
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/orders") && init?.method === "POST") {
      posts++;
      const body = JSON.parse(String(init.body));
      receipt = body.receipt;
      amount = body.amount;
      return Response.json({ id: orderId, amount, currency: "INR" });
    }
    if (url.endsWith("/orders/" + orderId))
      return Response.json({ id: orderId, amount, currency: "INR", receipt });
    if (url.endsWith("/payments/" + paymentId))
      return Response.json({
        id: paymentId,
        order_id: orderId,
        amount,
        currency: "INR",
        status: "captured",
      });
    throw Error("Unexpected mocked endpoint");
  };
  return {
    transport,
    orderId,
    paymentId,
    posts: () => posts,
    callback: () => ({
      orderId,
      paymentId,
      signature: createHmac("sha256", merchantSecret)
        .update(orderId + "|" + paymentId)
        .digest("hex"),
    }),
  };
}
test("hotel sandbox checkout verifies capture, scopes callbacks and deduplicates signed webhooks without real bookings", () =>
  scoped(() =>
    paymentFixture("test", async (f, saved) => {
      const mock = razorpayTransport();
      const order = await createHotelOrder(
        f.hotelId,
        saved.secret,
        { confirmed: true },
        mock.transport,
      );
      assert.equal(order.amount, 560000);
      assert.equal(order.mode, "test");
      assert.equal(
        (
          await createHotelOrder(
            f.hotelId,
            saved.secret,
            { confirmed: true },
            mock.transport,
          )
        ).orderId,
        order.orderId,
      );
      assert.equal(mock.posts(), 1);
      const failedMerchant = await binding
        .prepare('SELECT id FROM "HotelMerchant" WHERE "hotelId"=?')
        .bind(f.hotelId)
        .first<{ id: string }>();
      const failedBody = new TextEncoder().encode(
        JSON.stringify({
          event: "payment.failed",
          payload: {
            payment: { entity: { id: mock.paymentId, order_id: mock.orderId } },
          },
        }),
      );
      const failedSig = createHmac("sha256", webhookSecret)
        .update(failedBody)
        .digest("hex");
      await hotelPaymentWebhook(
        failedMerchant!.id,
        failedBody,
        failedSig,
        "event_failed",
        mock.transport,
      );
      assert.equal(
        (
          await createHotelOrder(
            f.hotelId,
            saved.secret,
            { confirmed: true },
            mock.transport,
          )
        ).orderId,
        order.orderId,
      );
      assert.equal(mock.posts(), 1);
      await assert.rejects(
        verifyHotelCheckout(
          f.hotelId,
          saved.secret,
          { ...mock.callback(), signature: "0".repeat(64) },
          mock.transport,
        ),
        /Invalid checkout signature/,
      );
      const result = await verifyHotelCheckout(
        f.hotelId,
        saved.secret,
        mock.callback(),
        mock.transport,
      );
      assert.equal(result.status, "SANDBOX_COMPLETED");
      assert.equal(result.paymentStatus, "SANDBOX_VERIFIED");
      assert.equal(result.confirmed, false);
      assert.equal(
        await db.booking.count({ where: { agencyId: f.owner.agencyId! } }),
        0,
      );
      const m = await binding
        .prepare('SELECT id FROM "HotelMerchant" WHERE "hotelId"=?')
        .bind(f.hotelId)
        .first<{ id: string }>();
      const raw = new TextEncoder().encode(
          JSON.stringify({
            event: "payment.captured",
            payload: {
              payment: {
                entity: { id: mock.paymentId, order_id: mock.orderId },
              },
            },
          }),
        ),
        sig = createHmac("sha256", webhookSecret).update(raw).digest("hex");
      await hotelPaymentWebhook(
        m!.id,
        raw,
        sig,
        "event_fixture",
        mock.transport,
      );
      await hotelPaymentWebhook(
        m!.id,
        raw,
        sig,
        "event_fixture",
        mock.transport,
      );
      await hotelPaymentWebhook(
        failedMerchant!.id,
        failedBody,
        failedSig,
        "event_failed_after_capture",
        mock.transport,
      );
      const captured = await binding
        .prepare(
          'SELECT status,"lastFailure" FROM "HotelPaymentAttempt" WHERE "stayId"=?',
        )
        .bind(saved.id)
        .first<{ status: string; lastFailure: string }>();
      assert.equal(captured!.status, "CAPTURED");
      assert.equal(captured!.lastFailure, "");
      assert.equal(
        (await binding
          .prepare(
            'SELECT COUNT(*) AS n FROM "HotelPaymentEvent" WHERE "merchantId"=?',
          )
          .bind(m!.id)
          .first<{ n: number }>())!.n,
        3,
      );
      assert.equal((await hotelQuote(f.hotelId, f.stay)).availableRooms, 1);
    }),
  ));
test("isolated live-mode contract confirms exactly once; captured late payments require review and do not consume a new room", () =>
  scoped(() =>
    paymentFixture("live", async (f, saved) => {
      const mock = razorpayTransport();
      await createHotelOrder(
        f.hotelId,
        saved.secret,
        { confirmed: true },
        mock.transport,
      );
      const confirmed = await verifyHotelCheckout(
        f.hotelId,
        saved.secret,
        mock.callback(),
        mock.transport,
      );
      assert.equal(confirmed.confirmed, true);
      assert.equal(confirmed.paymentStatus, "VERIFIED");
      await verifyHotelCheckout(
        f.hotelId,
        saved.secret,
        mock.callback(),
        mock.transport,
      );
      await assert.rejects(hotelQuote(f.hotelId, f.stay), /Not enough rooms/);
      const after = await hotelBookingOverview(f.owner.id, f.hotelId);
      assert.equal(after.payments.length, 1);
    }),
  ));
test("late capture is recorded for refund review; ambiguous order creation is never blindly retried", () =>
  scoped(() =>
    paymentFixture("test", async (f, saved) => {
      const mock = razorpayTransport();
      let unknown = true;
      const transport: typeof fetch = async (input, init) => {
        if (
          unknown &&
          String(input).endsWith("/orders") &&
          init?.method === "POST"
        ) {
          await mock.transport(input, init);
          throw Error("Simulated dropped response");
        }
        return mock.transport(input, init);
      };
      await assert.rejects(
        createHotelOrder(
          f.hotelId,
          saved.secret,
          { confirmed: true },
          transport,
        ),
        /reconcile/,
      );
      await assert.rejects(
        createHotelOrder(
          f.hotelId,
          saved.secret,
          { confirmed: true },
          transport,
        ),
        /reconciliation/,
      );
      assert.equal(mock.posts(), 1);
      unknown = false;
      await reconcileHotelOrder(
        f.owner.id,
        f.hotelId,
        { stayId: saved.id, orderId: mock.orderId, confirmed: true },
        transport,
      );
      await binding
        .prepare('UPDATE "HotelStayRequest" SET "holdUntil"=? WHERE id=?')
        .bind("2020-01-01T00:00:00.000Z", saved.id)
        .run();
      const result = await verifyHotelCheckout(
        f.hotelId,
        saved.secret,
        mock.callback(),
        transport,
      );
      assert.equal(result.confirmed, false);
      assert.equal(result.paymentStatus, "REFUND_REVIEW");
      assert.equal((await hotelQuote(f.hotelId, f.stay)).availableRooms, 1);
    }),
  ));

test("definitively rejected orders recover after owner merchant correction without duplicate intents", () =>
  scoped(() =>
    paymentFixture("test", async (f, saved) => {
      const reject: typeof fetch = async () =>
        Response.json(
          { error: { description: "Fictional bad credentials" } },
          { status: 401 },
        );
      await assert.rejects(
        createHotelOrder(f.hotelId, saved.secret, { confirmed: true }, reject),
        /rejected/,
      );
      await configureHotelMerchant(f.owner.id, "test-session", f.hotelId, {
        keyId: "rzp_test_HotelCorrected123",
        keySecret: merchantSecret,
        webhookSecret,
        authorized: true,
      });
      const mock = razorpayTransport();
      await createHotelOrder(
        f.hotelId,
        saved.secret,
        { confirmed: true },
        mock.transport,
      );
      assert.equal(
        (await hotelBookingOverview(f.owner.id, f.hotelId)).payments.length,
        1,
      );
      assert.equal(
        (
          await verifyHotelCheckout(
            f.hotelId,
            saved.secret,
            mock.callback(),
            mock.transport,
          )
        ).status,
        "SANDBOX_COMPLETED",
      );
    }),
  ));
