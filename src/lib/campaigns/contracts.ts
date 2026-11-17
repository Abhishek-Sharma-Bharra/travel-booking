import { z } from "zod";
import { dateValue, taxRate } from "../validation";
import { quoteTotal } from "../money";
export const publishSchema = z.object({
  title: z.string().trim().min(3).max(120),
  packageIds: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(12)
    .refine((a) => new Set(a).size === a.length),
  tax: taxRate,
  expiresOn: dateValue,
  approved: z.literal(true),
});
export const offerSchema = z.object({
  id: z.string(),
  name: z.string(),
  destination: z.string(),
  days: z.number().int().positive(),
  price: z.number().int().min(1).max(2000000000),
  inclusions: z.string(),
  exclusions: z.string(),
  hotelCategory: z.string(),
  itinerary: z.string(),
  paymentTerms: z.string(),
  cancellationTerms: z.string(),
  rateNotes: z.string(),
});
export type PublicOffer = z.infer<typeof offerSchema>;
export type PublicCampaign = {
  slug: string;
  title: string;
  agency: string;
  revision: number;
  expiresAt: string;
  taxBps: number;
  offers: PublicOffer[];
  aiAvailable: boolean;
  timezone: string;
};
export const requestSchema = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().positive(),
    packageId: z.string().min(1).max(100),
    customer: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(
        /^\+[1-9]\d{7,14}$/,
        "Use international format, e.g. +919876543210",
      ),
    email: z.union([z.literal(""), z.email().max(200)]).default(""),
    travelStart: dateValue,
    travellers: z.coerce.number().int().min(1).max(30),
    consent: z.literal(true),
    website: z.string().max(0).default(""),
    attribution: z
      .object({
        source: z.string().max(100).default(""),
        medium: z.string().max(100).default(""),
        campaign: z.string().max(100).default(""),
        content: z.string().max(100).default(""),
      })
      .strict(),
  })
  .strict();
export function priceSummary(
  offer: PublicOffer,
  travellers: number,
  taxBps: number,
) {
  const total = quoteTotal(offer.price, travellers, 0, taxBps);
  const subtotal = offer.price * travellers;
  return {
    currency: "INR" as const,
    unitPrice: offer.price,
    travellers,
    subtotal,
    tax: total - subtotal,
    total,
  };
}
export const chatSchema = z
  .object({
    message: z.string().trim().min(1).max(1500),
    language: z.enum(["English", "Hindi", "Hinglish"]),
    packageId: z.string().max(100).nullable(),
    travellers: z.number().int().min(1).max(30).default(1),
    aiConsent: z.boolean().default(false),
    history: z.array(z.string().max(500)).max(4).default([]),
  })
  .strict();
