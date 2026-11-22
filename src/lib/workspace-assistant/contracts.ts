import { z } from "zod";
export const tools = [
  "packages",
  "lead",
  "itinerary",
  "quotation",
  "followups",
  "booking",
  "suppliers",
  "payment",
] as const;
export type AssistantTool = (typeof tools)[number];
const key = z.string().min(1).max(100);
export const assistantInput = z
  .object({
    requestId: z.uuid(),
    mode: z.enum(["GUIDED", "LIVE"]).default("GUIDED"),
    tool: z.enum(["auto", ...tools]).default("auto"),
    question: z.string().trim().max(1000).default(""),
    language: z.enum(["en", "hi"]).default("en"),
    leadId: key.optional(),
    packageId: key.optional(),
    bookingId: key.optional(),
    supplierKind: z.enum(["HOTEL", "BUS", "CAR"]).default("HOTEL"),
    city: z.string().trim().max(80).default(""),
    start: z.iso.date().optional(),
    end: z.iso.date().optional(),
  })
  .strict()
  .refine((v) => !!v.start === !!v.end, "Choose both travel dates")
  .refine(
    (v) => v.mode !== "LIVE" || v.question.length >= 5,
    "Enter a question for live routing",
  )
  .refine(
    (v) => v.mode !== "LIVE" || v.tool === "auto",
    "Use guided mode for a selected tool, or automatic routing for live AI",
  );
export type AssistantInput = z.infer<typeof assistantInput>;
export const planSchema = z
  .object({
    tool: z.enum(tools),
    query: z.string().max(100),
    language: z.enum(["en", "hi"]),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export type ToolResult = {
  tool: AssistantTool;
  title: string;
  summary: string;
  note: string;
  items: { id: string; label: string; detail: string }[];
  draft?: {
    kind: "itinerary" | "quotation" | "followup";
    text: string;
    leadId: string;
    packageId?: string;
  };
  next?: {
    page:
      | "Enquiries"
      | "Packages"
      | "Quotations"
      | "Bookings"
      | "Itineraries & costing"
      | "Integrations";
    leadId?: string;
    packageId?: string;
  };
  source: string;
  asOf: string;
};
export function guidedPlan(v: AssistantInput): Plan {
  let tool: AssistantTool = v.tool === "auto" ? "packages" : v.tool;
  if (v.tool === "auto") {
    const q = v.question.toLowerCase();
    if (/payment|pay |paisa|paise|bhugtan|भुगतान/.test(q)) tool = "payment";
    else if (/follow.?up|contact today|aaj|आज|संपर्क/.test(q))
      tool = "followups";
    else if (/booking|booked|बुकिंग/.test(q)) tool = "booking";
    else if (/itinerar|day.?wise|yatra|यात्रा/.test(q)) tool = "itinerary";
    else if (/quotation|quote|proposal|कोटेशन/.test(q)) tool = "quotation";
    else if (/hotel|supplier|bus|car|होटल|बस/.test(q)) tool = "suppliers";
    else if (/lead|customer|enquiry|ग्राहक/.test(q)) tool = "lead";
  }
  return { tool, query: "", language: v.language };
}
