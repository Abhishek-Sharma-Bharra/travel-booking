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

// Static, allowlisted guidance only: never echo submitted values or raw issues.
export function hotelValidationMessage(error: z.ZodError) {
  const hints: Record<string, string> = {
    name: "Name: use 2–150 characters (room names: 2–100).",
    address: "Address: use no more than 500 characters.",
    city: "City: use no more than 100 characters.",
    region: "State / region: use no more than 100 characters.",
    countryCode: "Country code: use two capital letters, for example IN.",
    postalCode: "Postal code: use no more than 20 characters.",
    timezone: "Hotel timezone: use an IANA timezone, for example Asia/Kolkata.",
    contactEmail: "Hotel contact email: enter a valid email address.",
    contactPhone:
      "Hotel phone: include + and country code, for example +919876543210, without spaces.",
    amenities:
      "Amenities: use up to 30 unique entries, each at most 80 characters.",
    photoUrls: "Photo URLs: use up to 12 complete URLs, one per line.",
    policies: "Hotel policies: use no more than 6000 characters.",
    cancellationPolicy:
      "Cancellation policy: use no more than 6000 characters.",
    taxBps: "Tax percentage: enter a number from 0 to 100.",
    totalRooms: "Room count: enter a whole number from 1 to 10000.",
    maxAdults: "Maximum adults: enter a whole number from 1 to 20.",
    maxChildren: "Maximum children: enter a whole number from 0 to 20.",
    maxOccupancy: "Combined occupancy: enter a whole number from 1 to 20.",
    room: "Combined occupancy must cover each guest limit and cannot exceed adults plus children.",
    description: "Room description: use no more than 3000 characters.",
    reason: "Review reason: use 10–1000 characters.",
  };
  const messages = error.issues.map((issue) => {
    const key =
      issue.path[0] === "profile" || issue.path[0] === "room"
        ? String(issue.path[1] ?? issue.path[0])
        : String(issue.path[0] ?? "");
    return (
      hints[key] ?? "Check required hotel values and remove unsupported fields."
    );
  });
  return "Please correct: " + [...new Set(messages)].join(" ");
}
