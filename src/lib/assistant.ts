import { z } from "zod";
import type { Dataset } from "./data";
import { balances, indiaToday, inr } from "./money";
export const extractionSchema = z.object({
  customer: z.string().max(100).nullable(),
  destination: z.string().max(100).nullable(),
  departureCity: z.string().max(100).nullable(),
  travelPeriod: z.string().max(150).nullable(),
  travelStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  travelEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  adults: z.number().int().min(1).max(100).nullable(),
  children: z.number().int().min(0).max(99).nullable(),
  childAges: z.array(z.number().int().min(0).max(17)).max(99),
  nights: z.number().int().min(1).max(365).nullable(),
  budgetAmount: z.number().min(0).max(20000000).nullable(),
  currency: z.string().max(10).nullable(),
  budgetBasis: z.enum(["total", "per person", "unknown"]),
  hotelCategory: z.string().max(100).nullable(),
  tripType: z.string().max(100).nullable(),
  preferences: z.array(z.string().max(200)).max(20),
  missing: z.array(z.string().max(200)).max(20),
  questions: z.array(z.string().max(300)).max(20),
});
export type Extraction = z.infer<typeof extractionSchema>;
export const fictionalMessage =
  "December mein 2 adults ka Bali honeymoon chahiye, 5 nights, total budget 1.2 lakh.";
export const fictionalExtraction: Extraction = {
  customer: null,
  destination: "Bali",
  departureCity: null,
  travelPeriod: "December (year unresolved)",
  travelStart: null,
  travelEnd: null,
  adults: 2,
  children: null,
  childAges: [],
  nights: 5,
  budgetAmount: 120000,
  currency: "INR",
  budgetBasis: "total",
  hotelCategory: null,
  tripType: "Honeymoon",
  preferences: [],
  missing: [
    "Exact dates and year",
    "Departure city",
    "Customer name",
    "Children, if any",
    "Hotel category",
  ],
  questions: [
    "Which year and exact dates in December?",
    "Which city will you depart from?",
    "Are any children travelling?",
    "What hotel category would you prefer?",
  ],
};
export type Priority = {
  key: string;
  kind: string;
  leadId: string;
  recordId: string;
  owner: string;
  date: string;
  reason: string;
};
export function priorities(data: Dataset, day = indiaToday()): Priority[] {
  const result: Priority[] = [];
  const add = (
    kind: string,
    l: Dataset["leads"][number],
    date: string,
    reason: string,
    recordId = l.id,
  ) =>
    result.push({
      key: kind + recordId,
      kind,
      leadId: l.id,
      recordId,
      owner: l.assignedId,
      date,
      reason,
    });
  const open = data.leads.filter((l) => !["Won", "Lost"].includes(l.stage));
  for (const l of open) {
    if (l.stage === "New" && l.firstResponseHours === null)
      add(
        "First response",
        l,
        l.enquiryDate,
        "No first response has been recorded.",
      );
    if (l.followUp && l.followUp.slice(0, 10) < day)
      add(
        "Overdue follow-up",
        l,
        l.followUp,
        "Scheduled follow-up is overdue.",
      );
    const q = data.quotes.find(
      (q) => q.leadId === l.id && ["Draft", "Approved"].includes(q.status),
    );
    if (q && q.createdAt.slice(0, 10) < day)
      add(
        "Quotation follow-up",
        l,
        q.createdAt,
        "Open quotation; confirm customer response.",
        q.id,
      );
  }
  const end = new Date(day + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 14);
  for (const b of data.bookings) {
    if (b.status === "Cancelled") continue;
    const l = data.leads.find((l) => l.id === b.leadId);
    if (!l) continue;
    if (b.dueDate.slice(0, 10) <= day && balances(b).customerDue > 0)
      add(
        "Customer payment due",
        l,
        b.dueDate,
        `${inr(balances(b).customerDue)} outstanding on recorded booking due date.`,
        b.id,
      );
    if (
      b.travelStart.slice(0, 10) >= day &&
      b.travelStart.slice(0, 10) <= end.toISOString().slice(0, 10) &&
      b.supplierStatus !== "Confirmed"
    )
      add(
        "Departure task",
        l,
        b.travelStart,
        `Recorded supplier confirmation task: ${b.supplierStatus}.`,
        b.id,
      );
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
export function followUpDraft(
  data: Dataset,
  leadId: string,
  kind: string,
  language: string,
) {
  const l = data.leads.find((l) => l.id === leadId);
  if (!l) throw new Error("Enquiry unavailable");
  const q = data.quotes.find((q) => q.leadId === leadId);
  const b = data.bookings.find((b) => b.leadId === leadId);
  const facts =
    kind === "Payment reminder"
      ? b
        ? `Recorded customer balance: ${inr(balances(b).customerDue)}. Due date: ${b.dueDate.slice(0, 10)}.`
        : "No booking payment is recorded; please confirm the booking details."
      : kind === "Quotation follow-up"
        ? q
          ? `Regarding quotation ${q.id} for ${inr(q.total)}.`
          : "No quotation has been recorded yet."
        : kind === "Missing information"
          ? "Please confirm your exact dates, departure city and hotel preference."
          : kind === "Lost-lead reactivation"
            ? "Would you like to discuss your travel plans again?"
            : "Thank you for your enquiry. How can we help with your trip?";
  const greeting =
    language === "Hindi"
      ? `नमस्ते ${l.customer}, ${l.destination} की आपकी यात्रा के बारे में।`
      : language === "Hinglish"
        ? `Namaste ${l.customer}, aapki ${l.destination} trip ke baare mein.`
        : `Hello ${l.customer}, regarding your ${l.destination} trip.`;
  // Monetary facts remain verbatim; reviewed templates, never implied delivery.
  const local =
    language === "Hindi"
      ? {
          "First response":
            "आपकी पूछताछ के लिए धन्यवाद। आपकी यात्रा में कैसे मदद कर सकते हैं?",
          "Missing information":
            "कृपया सही तारीखें, प्रस्थान शहर और होटल की पसंद बताएं।",
          "Lost-lead reactivation":
            "क्या आप अपनी यात्रा की योजना पर फिर बात करना चाहेंगे?",
        }
      : language === "Hinglish"
        ? {
            "First response":
              "Enquiry ke liye dhanyavaad. Aapki trip mein kaise madad karein?",
            "Missing information":
              "Please exact dates, departure city aur hotel preference confirm karein.",
            "Lost-lead reactivation":
              "Kya aap apni travel plans par dobara baat karna chahenge?",
          }
        : {};
  let reviewedFacts = (local as Record<string, string>)[kind] || facts;
  if (language === "Hindi" && kind === "Quotation follow-up")
    reviewedFacts = q
      ? `कोटेशन ${q.id}, कुल ${inr(q.total)} के बारे में आपकी राय जानना चाहेंगे।`
      : "अभी कोई कोटेशन दर्ज नहीं है।";
  if (language === "Hinglish" && kind === "Quotation follow-up")
    reviewedFacts = q
      ? `Quotation ${q.id}, total ${inr(q.total)} par aapka feedback chahiye.`
      : "Abhi koi quotation record nahi hai.";
  if (language === "Hindi" && kind === "Payment reminder")
    reviewedFacts = b
      ? `दर्ज बकाया: ${inr(balances(b).customerDue)}। भुगतान तारीख: ${b.dueDate.slice(0, 10)}।`
      : "कोई बुकिंग भुगतान दर्ज नहीं है; कृपया बुकिंग की जानकारी की पुष्टि करें।";
  if (language === "Hinglish" && kind === "Payment reminder")
    reviewedFacts = b
      ? `Recorded baki payment: ${inr(balances(b).customerDue)}. Due date: ${b.dueDate.slice(0, 10)}.`
      : "Booking payment record nahi hai; please booking details confirm karein.";
  return `${greeting}\n${reviewedFacts}`;
}
export function packageSuggestions(data: Dataset, leadId: string) {
  const l = data.leads.find((l) => l.id === leadId);
  if (!l) return [];
  return data.packages
    .filter((p) => p.destination.toLowerCase() === l.destination.toLowerCase())
    .map((p) => ({
      id: p.id,
      name: p.name,
      reason: `Recorded destination match; ${p.days} days; ${inr(p.price)} per traveller. Supplier availability and room basis require confirmation.`,
    }));
}
