import { z } from "zod";
import { paise } from "./money";
export const sources = [
  "Meta Ads",
  "Google Ads",
  "WhatsApp",
  "Referral",
  "Website",
  "Walk-in",
] as const;
export const stages = [
  "New",
  "Contacted",
  "Qualified",
  "Quoted",
  "Won",
  "Lost",
] as const;
export const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .refine((s) => {
    const d = new Date(s);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date")
  .transform((s) => new Date(s + "T00:00:00.000Z"));
export const amount = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return paise(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});
export const taxRate = amount.refine((n) => n <= 10000, {
  message: "Tax must be between 0 and 100% with at most two decimal places",
});
const text = z.string().trim().max(2000);
export const leadSchema = z
  .object({
    externalId: z.string().trim().min(1).max(80),
    customer: z.string().trim().min(2).max(100),
    email: z.union([z.literal(""), z.email()]).default(""),
    phone: z
      .string()
      .regex(/^[+\d ()-]{0,20}$/)
      .default(""),
    destination: z.string().trim().min(2).max(100),
    enquiryDate: dateValue,
    travelStart: dateValue,
    travelEnd: dateValue,
    travellers: z.coerce.number().int().min(1).max(100),
    budget: amount,
    quotedPrice: amount,
    source: z.enum(sources),
    assignedId: z.string().min(1),
    stage: z.enum(stages),
    notes: text.default(""),
    lostReason: text.default(""),
    followUp: z
      .union([dateValue, z.literal("").transform(() => null)])
      .default(null),
    firstResponseHours: z
      .union([
        z.literal("").transform(() => null),
        z.null(),
        z.number().min(0).max(1000),
        z
          .string()
          .trim()
          .regex(/^\d+(\.\d+)?$/)
          .transform(Number)
          .pipe(z.number().min(0).max(1000)),
      ])
      .default(null),
    repeatCustomer: z
      .enum(["", "true", "false"])
      .transform((v) => (v === "" ? null : v === "true"))
      .default(null),
    itineraryRequested: z
      .enum(["", "true", "false"])
      .transform((v) => (v === "" ? null : v === "true"))
      .default(null),
  })
  .refine((v) => v.travelEnd >= v.travelStart, {
    message: "Travel end must be on or after start",
    path: ["travelEnd"],
  })
  .refine((v) => v.travelStart >= v.enquiryDate, {
    message: "Travel must follow the enquiry date",
    path: ["travelStart"],
  })
  .refine((v) => v.stage !== "Lost" || v.lostReason.length > 0, {
    message: "Please provide a lost reason",
    path: ["lostReason"],
  });
export const packageSchema = z.object({
  name: z.string().trim().min(2).max(100),
  destination: z.string().trim().min(2).max(100),
  days: z.coerce.number().int().min(1).max(365),
  inclusions: text,
  exclusions: text,
  price: amount,
  estimatedCost: amount,
});
export function safeCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    cols.map(cell).join(","),
    ...rows.map((r) => cols.map((c) => cell(r[c])).join(",")),
  ].join("\r\n");
}
