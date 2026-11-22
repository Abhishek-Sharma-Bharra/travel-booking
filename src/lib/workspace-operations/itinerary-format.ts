import { z } from "zod";
const money = z.number().int().min(0).max(2_000_000_000);
export const itineraryPayloadSchema = z
  .object({
    title: z.string().trim().min(2).max(180),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    travellers: z.number().int().min(1).max(100),
    days: z
      .array(
        z
          .object({
            day: z.number().int().min(1).max(60),
            title: z.string().trim().min(1).max(150),
            notes: z.string().max(3000),
            overnight: z.string().max(150),
          })
          .strict(),
      )
      .min(1)
      .max(60)
      .refine(
        (rows) => rows.every((r, i) => r.day === i + 1),
        "Days must be sequential from day 1",
      ),
    costs: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(150),
            kind: z.enum(["Accommodation", "Transport", "Activities", "Other"]),
            quantity: z.number().int().min(1).max(10000),
            unitCostPaise: money,
          })
          .strict(),
      )
      .max(60),
    markupBps: z.number().int().min(0).max(10000),
    discountPaise: money,
    taxBps: z.number().int().min(0).max(10000),
    inclusions: z.string().max(5000),
    exclusions: z.string().max(5000),
    terms: z.string().max(6000),
  })
  .strict()
  .refine(
    (p) => p.endDate >= p.startDate,
    "End date must not precede start date",
  );
export type ItineraryPayload = z.infer<typeof itineraryPayloadSchema>;
export function itineraryTotals(input: ItineraryPayload) {
  const cost = input.costs.reduce(
    (n, r) => n + BigInt(r.quantity) * BigInt(r.unitCostPaise),
    0n,
  );
  const selling = cost + (cost * BigInt(input.markupBps) + 5000n) / 10000n;
  const net = selling - BigInt(input.discountPaise);
  if (net < 0n)
    throw new Error("Discount cannot exceed the estimated selling amount");
  const tax = (net * BigInt(input.taxBps) + 5000n) / 10000n,
    total = net + tax;
  if ([cost, selling, net, tax, total].some((v) => v > 2_000_000_000n))
    throw new Error("Itinerary estimate exceeds the supported amount");
  return {
    supplierCost: Number(cost),
    selling: Number(selling),
    net: Number(net),
    tax: Number(tax),
    total: Number(total),
    contribution: Number(net - cost),
  };
}
export function publicItineraryPayload(
  payload: ItineraryPayload,
  canViewCosts: boolean,
) {
  return canViewCosts ? payload : { ...payload, costs: [], markupBps: 0 };
}
export function packageItineraryDraft(
  p: {
    name: string;
    days: number;
    itinerary: string;
    inclusions: string;
    exclusions: string;
    paymentTerms: string;
    cancellationTerms: string;
  },
  startDate: string,
  endDate: string,
  travellers: number,
): ItineraryPayload {
  return {
    title: p.name,
    startDate,
    endDate,
    travellers,
    days: Array.from({ length: Math.min(60, p.days) }, (_, i) => ({
      day: i + 1,
      title: `Day ${i + 1}`,
      notes:
        i === 0
          ? p.itinerary.slice(0, 3000)
          : "Add the activities and timings after review.",
      overnight: "",
    })),
    costs: [],
    markupBps: 0,
    discountPaise: 0,
    taxBps: 0,
    inclusions: p.inclusions,
    exclusions: p.exclusions,
    terms: [p.paymentTerms, p.cancellationTerms]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 6000),
  };
}
