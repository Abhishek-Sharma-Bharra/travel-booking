import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  hotelOverview,
  mutateHotel,
  reviewHotel,
  hotelReviewQueue,
} from "../src/lib/hotels/service";
import {
  hotelProfileSchema,
  hotelRoomSchema,
} from "../src/lib/hotels/validation";
import { hotelError } from "../src/lib/hotels/http";
import { loginDestination, mfaDestination } from "../src/lib/auth-destination";
const profile = {
  name: "Fictional Test Hotel",
  address: "123 Fictional Test Road",
  city: "Manali",
  region: "Himachal Pradesh",
  countryCode: "IN",
  postalCode: "175131",
  timezone: "Asia/Kolkata",
  contactEmail: "hotel@test.invalid",
  contactPhone: "+919876543210",
  amenities: ["Wi-Fi"],
  photoUrls: [],
  policies: "Check-in times and house rules must be reviewed by the hotel.",
  cancellationPolicy:
    "Cancellation terms must be independently reviewed before publication.",
  taxBps: 1200,
};
const room = {
  name: "Deluxe",
  description: "Fictional category",
  totalRooms: 5,
  maxAdults: 2,
  maxChildren: 1,
  maxOccupancy: 3,
  amenities: ["Wi-Fi"],
  active: true,
};
test("hotel schema and redirect allowlists reject forged roles, invalid occupancy, tax, URLs and external destinations", () => {
  assert.ok(hotelProfileSchema.safeParse(profile).success);
  assert.equal(
    hotelProfileSchema.safeParse({ ...profile, status: "APPROVED" }).success,
    false,
  );
  assert.equal(
    hotelProfileSchema.safeParse({ ...profile, taxBps: -1 }).success,
    false,
  );
  assert.equal(
    hotelProfileSchema.safeParse({ ...profile, timezone: "Invented/Timezone" })
      .success,
    false,
  );
  assert.equal(
    hotelRoomSchema.safeParse({ ...room, maxOccupancy: 1 }).success,
    false,
  );
  assert.equal(
    hotelRoomSchema.safeParse({ ...room, totalRooms: 0 }).success,
    false,
  );
  assert.equal(loginDestination("https://attacker.invalid"), "/workspace");
  assert.equal(loginDestination("//attacker.invalid"), "/workspace");
  assert.equal(loginDestination("hotelier"), "/hotelier");
  assert.equal(mfaDestination("hotel-admin"), "/admin/hotels");
  assert.equal(mfaDestination("admin"), "/admin");
});
test("hotel registration isolation, serialized revisions, verified operators, review state machine and audit rollback", async () => {
  const prefix = "hotel-" + randomUUID(),
    old = {
      enabled: process.env.HOTELS_ENABLED,
      admins: process.env.PLATFORM_ADMIN_EMAILS,
      hosts: process.env.HOTEL_IMAGE_HOSTS,
    };
  const a = prefix + "-a",
    b = prefix + "-b",
    viewer = prefix + "-viewer",
    operator = prefix + "-operator",
    token = prefix + "-session";
  try {
    process.env.HOTELS_ENABLED = "true";
    process.env.HOTEL_IMAGE_HOSTS = "cdn.example.test";
    await db.agency.create({ data: { id: prefix, name: prefix } });
    for (const id of [a, b, viewer, operator])
      await db.user.create({
        data: {
          id,
          name: "Fixture",
          email: id + "@test.invalid",
          agencyId: prefix,
          emailVerified: true,
          twoFactorEnabled: id === operator,
        },
      });
    const first = await mutateHotel(a, { action: "create", profile });
    const second = await mutateHotel(b, {
      action: "create",
      profile: { ...profile, name: "Another Test Hotel" },
    });
    assert.equal((await hotelOverview(a)).hotels.length, 1);
    assert.equal((await hotelOverview(b)).hotels[0].id, second.hotelId);
    await assert.rejects(
      mutateHotel(b, {
        action: "profile",
        hotelId: first.hotelId,
        revision: 0,
        profile,
      }),
      /Hotel not found/,
    );
    await assert.rejects(
      mutateHotel(a, {
        action: "create",
        profile: {
          ...profile,
          photoUrls: ["https://unapproved.example.test/photo.jpg"],
        },
      }),
      /approved HTTPS/,
    );
    await assert.rejects(
      mutateHotel(a, {
        action: "create",
        profile: {
          ...profile,
          photoUrls: ["https://user:secret@cdn.example.test/photo.jpg"],
        },
      }),
      /approved HTTPS/,
    );
    await db.hotelMember.create({
      data: { hotelId: first.hotelId, userId: viewer, role: "VIEWER" },
    });
    assert.equal((await hotelOverview(viewer)).hotels[0].id, first.hotelId);
    await assert.rejects(
      mutateHotel(viewer, {
        action: "room",
        hotelId: first.hotelId,
        revision: 0,
        room,
      }),
      /edit permission/,
    );
    await assert.rejects(
      mutateHotel(a, { action: "submit", hotelId: first.hotelId, revision: 0 }),
      /Complete address/,
    );
    await mutateHotel(a, {
      action: "room",
      hotelId: first.hotelId,
      revision: 0,
      room,
    });
    await mutateHotel(b, {
      action: "room",
      hotelId: second.hotelId,
      revision: 0,
      room,
    });
    const foreignRoom = await db.hotelRoomCategory.findFirstOrThrow({
      where: { hotelId: second.hotelId },
    });
    await assert.rejects(
      mutateHotel(a, {
        action: "room",
        hotelId: first.hotelId,
        revision: 1,
        roomId: foreignRoom.id,
        room,
      }),
      /not found in this hotel/,
    );
    assert.equal(
      (await db.hotel.findUniqueOrThrow({ where: { id: first.hotelId } }))
        .revision,
      1,
    );
    const race = await Promise.allSettled([
      mutateHotel(a, {
        action: "profile",
        hotelId: first.hotelId,
        revision: 1,
        profile: { ...profile, name: "First update" },
      }),
      mutateHotel(a, {
        action: "profile",
        hotelId: first.hotelId,
        revision: 1,
        profile: { ...profile, name: "Second update" },
      }),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const conflict = race.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    assert.match(conflict.reason.message, /Refresh/);
    await mutateHotel(a, {
      action: "submit",
      hotelId: first.hotelId,
      revision: 2,
    });
    process.env.PLATFORM_ADMIN_EMAILS = operator + "@test.invalid";
    await assert.rejects(hotelReviewQueue(a, token), /administrator/);
    await assert.rejects(
      hotelReviewQueue(operator, token),
      /authenticator again/,
    );
    await db.session.create({
      data: {
        id: token,
        token,
        userId: operator,
        expiresAt: new Date(Date.now() + 3600000),
        mfaVerifiedAt: new Date(Date.now() - 5 * 3600000),
      },
    });
    await assert.rejects(
      hotelReviewQueue(operator, token),
      /authenticator again/,
    );
    await db.session.update({
      where: { id: token },
      data: { mfaVerifiedAt: new Date() },
    });
    assert.ok(
      (await hotelReviewQueue(operator, token)).hotels.some(
        (h) => h.id === first.hotelId,
      ),
    );
    const review = {
      hotelId: first.hotelId,
      revision: 3,
      decision: "APPROVED",
      reason: "Fictional business checks completed in a test only",
      businessVerified: true,
    };
    await assert.rejects(
      reviewHotel(operator, token, { ...review, businessVerified: false }),
    );
    await db.hotelMember.create({
      data: { hotelId: first.hotelId, userId: operator, role: "VIEWER" },
    });
    await assert.rejects(reviewHotel(operator, token, review), /cannot review/);
    await db.hotelMember.delete({
      where: { hotelId_userId: { hotelId: first.hotelId, userId: operator } },
    });
    await reviewHotel(operator, token, review);
    assert.equal(
      (await db.hotel.findUniqueOrThrow({ where: { id: first.hotelId } }))
        .status,
      "APPROVED",
    );
    await assert.rejects(reviewHotel(operator, token, review), /Refresh/);
    await mutateHotel(a, {
      action: "profile",
      hotelId: first.hotelId,
      revision: 4,
      profile,
    });
    assert.equal(
      (await db.hotel.findUniqueOrThrow({ where: { id: first.hotelId } }))
        .status,
      "DRAFT",
    );
    await mutateHotel(a, {
      action: "submit",
      hotelId: first.hotelId,
      revision: 5,
    });
    await reviewHotel(operator, token, {
      ...review,
      revision: 6,
      decision: "REJECTED",
      businessVerified: false,
    });
    await mutateHotel(a, {
      action: "submit",
      hotelId: first.hotelId,
      revision: 7,
    });
    await reviewHotel(operator, token, { ...review, revision: 8 });
    await reviewHotel(operator, token, {
      ...review,
      revision: 9,
      decision: "SUSPENDED",
      businessVerified: false,
    });
    await assert.rejects(
      mutateHotel(a, {
        action: "profile",
        hotelId: first.hotelId,
        revision: 10,
        profile,
      }),
      /Suspended/,
    );
    const audits = await db.hotelAuditEntry.findMany({
      where: { hotelId: first.hotelId },
      orderBy: { revision: "asc" },
    });
    assert.equal(audits.length, 11);
    assert.deepEqual(
      audits.map((x) => x.revision),
      Array.from({ length: 11 }, (_, i) => i),
    );
    assert.equal((await hotelOverview(a)).bookingEnabled, false);
    await db.user.update({ where: { id: a }, data: { emailVerified: false } });
    await assert.rejects(hotelOverview(a), /verified/);
    await db.user.update({
      where: { id: a },
      data: { emailVerified: true, disabled: true },
    });
    await assert.rejects(hotelOverview(a), /verified/);
    process.env.HOTELS_ENABLED = "false";
    await assert.rejects(hotelOverview(b), /not enabled/);
  } finally {
    await db.hotel.deleteMany({
      where: { members: { some: { userId: { in: [a, b] } } } },
    });
    await db.user.deleteMany({
      where: { id: { in: [a, b, viewer, operator] } },
    });
    await db.agency.deleteMany({ where: { id: prefix } });
    for (const [key, v] of Object.entries({
      HOTELS_ENABLED: old.enabled,
      PLATFORM_ADMIN_EMAILS: old.admins,
      HOTEL_IMAGE_HOSTS: old.hosts,
    }))
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    await db.$disconnect();
  }
});
test("hotel errors do not echo database errors or secret-bearing input", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const r = hotelError(
      new Error("postgresql://secret:password@example.test/db"),
    );
    assert.equal(r.status, 503);
    assert.doesNotMatch(
      JSON.stringify(await r.json()),
      /password|postgresql|secret/,
    );
  } finally {
    console.error = original;
  }
});
