import { z } from "zod";
export const supplierKinds = [
  "HOTEL",
  "TRANSPORT",
  "DMC",
  "SIGHTSEEING",
  "GUIDE",
  "OTHER",
] as const;
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !isNaN(+new Date(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid calendar date",
  );
export const supplierProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    kind: z.enum(supplierKinds),
    city: z.string().trim().max(100),
    contactName: z.string().trim().max(100),
    email: z.union([z.literal(""), z.email().max(254)]),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d ()-]{0,20}$/),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    notes: z.string().trim().max(1500),
    contract: z
      .object({
        reference: z.string().trim().max(100),
        status: z.enum(["DRAFT", "RECORDED", "ARCHIVED"]),
        validFrom: day.nullable(),
        validUntil: day.nullable(),
        currency: z.literal("INR"),
        ratePaise: z.number().int().min(0).max(100000000).nullable(),
        rateUnit: z.enum(["NIGHT", "TRIP", "PERSON", "KM"]).nullable(),
        paymentTerms: z.string().trim().max(1500),
        cancellationTerms: z.string().trim().max(1500),
        rateNotes: z.string().trim().max(1500),
      })
      .strict()
      .refine(
        (c) => !c.validFrom || !c.validUntil || c.validUntil >= c.validFrom,
        { message: "Contract end must follow start", path: ["validUntil"] },
      )
      .refine((c) => (c.ratePaise === null) === (c.rateUnit === null), {
        message: "Supply both a rate and its unit, or neither",
        path: ["ratePaise"],
      })
      .refine(
        (c) =>
          c.status !== "RECORDED" ||
          (!!c.reference &&
            !!c.validFrom &&
            !!c.validUntil &&
            !!c.paymentTerms &&
            !!c.cancellationTerms),
        {
          message:
            "Recorded contracts need reference, dates, payment and cancellation terms",
          path: ["status"],
        },
      ),
  })
  .strict();
export type SupplierProfile = z.infer<typeof supplierProfileSchema>;
export const supplierSaveSchema = z
  .object({
    requestId: z.uuid(),
    id: z.uuid().optional(),
    revision: z.number().int().min(0).max(29),
    profile: supplierProfileSchema,
  })
  .strict();
export const emptySupplierProfile = (): SupplierProfile => ({
  name: "",
  kind: "HOTEL",
  city: "",
  contactName: "",
  email: "",
  phone: "",
  status: "ACTIVE",
  notes: "",
  contract: {
    reference: "",
    status: "DRAFT",
    validFrom: null,
    validUntil: null,
    currency: "INR",
    ratePaise: null,
    rateUnit: null,
    paymentTerms: "",
    cancellationTerms: "",
    rateNotes: "",
  },
});
