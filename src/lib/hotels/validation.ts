import { z } from "zod";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v),
      "Remove control characters",
    );
const list = z
  .array(text(80).min(1))
  .max(30)
  .refine((v) => new Set(v).size === v.length, "Remove duplicate amenities");
export const hotelProfileSchema = z
  .object({
    name: text(150).min(2),
    address: text(500),
    city: text(100),
    region: text(100),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    postalCode: text(20),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v }).format();
          return true;
        } catch {
          return false;
        }
      }, "Use a valid IANA timezone"),
    contactEmail: z.email().max(254),
    contactPhone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, "Use international phone format"),
    amenities: list,
    photoUrls: z.array(z.url().max(2048)).max(12),
    policies: text(6000),
    cancellationPolicy: text(6000),
    taxBps: z.number().int().min(0).max(10000),
  })
  .strict();
export const hotelRoomSchema = z
  .object({
    name: text(100).min(2),
    description: text(3000),
    totalRooms: z.number().int().min(1).max(10000),
    maxAdults: z.number().int().min(1).max(20),
    maxChildren: z.number().int().min(0).max(20),
    maxOccupancy: z.number().int().min(1).max(20),
    amenities: list,
    active: z.boolean(),
  })
  .strict()
  .refine(
    (v) =>
      v.maxOccupancy >= Math.max(v.maxAdults, v.maxChildren) &&
      v.maxOccupancy <= v.maxAdults + v.maxChildren,
    "Review combined room occupancy",
  );
const revision = z.number().int().min(0),
  hotelId = z.string().min(1).max(100);
export const hotelActionSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("create"), profile: hotelProfileSchema })
    .strict(),
  z
    .object({
      action: z.literal("profile"),
      hotelId,
      revision,
      profile: hotelProfileSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("room"),
      hotelId,
      revision,
      roomId: hotelId.optional(),
      room: hotelRoomSchema,
    })
    .strict(),
  z.object({ action: z.literal("submit"), hotelId, revision }).strict(),
]);
export const hotelReviewSchema = z
  .object({
    hotelId,
    revision,
    decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
    reason: text(1000).min(10),
    businessVerified: z.boolean(),
  })
  .strict()
  .refine(
    (v) => v.decision !== "APPROVED" || v.businessVerified,
    "Business verification must be attested before approval",
  );
