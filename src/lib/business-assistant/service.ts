import { z } from "zod";
import { HttpError } from "../http";
import { inr } from "../money";
import { hotelOperationsOverview } from "../hotels/operations";
import { transportOperations } from "../marketplace/operations";
export const businessQuestion = z
  .object({
    kind: z.enum(["HOTEL", "TRANSPORT"]),
    businessId: z.string().min(1).max(100),
    month: z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/),
    question: z.string().trim().min(1).max(500),
    language: z.enum(["en", "hi"]).default("en"),
  })
  .strict();
export type BusinessAnswer = {
  title: string;
  summary: string;
  facts: { label: string; value: string }[];
  note: string;
  source: string;
  asOf: string;
  month: string;
  task: "summary" | "revenue" | "availability" | "planning" | "help";
};
export function questionTask(question: string): BusinessAnswer["task"] {
  if (
    /\b(send|refund|cancel|delete|confirm|charge|pay|reserve)\b|भेज|रिफंड|भुगतान करो|बुक करो|डिलीट/i.test(
      question,
    )
  )
    return "help";
  if (
    /forecast|predict|planning|demand|next month|अनुमान|अगले|मांग/i.test(
      question,
    )
  )
    return "planning";
  if (
    /revenue|income|earning|profit|expense|collection|कमाई|खर्च|आय|मुनाफा/i.test(
      question,
    )
  )
    return "revenue";
  if (
    /occupancy|availab|utili[sz]|fleet|room night|कमरे|उपलब्ध|ऑक्यूपेंसी/i.test(
      question,
    )
  )
    return "availability";
  if (/summary|overview|business doing|snapshot|सारांश|स्थिति/i.test(question))
    return "summary";
  return "help";
}
const percent = (numerator: number, denominator: number) =>
  denominator > 0
    ? `${((numerator / denominator) * 100).toFixed(1)}%`
    : "Unknown · no configured capacity";
export async function answerBusinessQuestion(
  userId: string,
  input: unknown,
): Promise<BusinessAnswer> {
  if (process.env.WORKSPACE_ASSISTANT_ENABLED !== "true")
    throw new HttpError(404, "Business assistant is not enabled");
  const v = businessQuestion.parse(input);
  if (/passport|aadhaar|aadhar|cvv|credit card|bank account/i.test(v.question))
    throw new HttpError(
      400,
      "Remove identity documents and payment details from the question",
    );
  // Report services re-read the enabled user and current hotel membership/business ownership.
  // Never trust a submitted supplier ID or the session's cached role.
  const hotel =
    v.kind === "HOTEL"
      ? await hotelOperationsOverview(userId, v.businessId, v.month, false)
      : null;
  const fleet =
    v.kind === "TRANSPORT"
      ? await transportOperations(userId, v.businessId, v.month)
      : null;
  const task = questionTask(v.question),
    hi = v.language === "hi";
  const answer: BusinessAnswer = {
    task,
    month: v.month,
    asOf: new Date().toISOString(),
    source: hotel
      ? "Authorised hotel operations"
      : "Authorised transport operations",
    title: hi
      ? "आपके व्यवसाय की दर्ज जानकारी"
      : "Your recorded business snapshot",
    summary: hi
      ? "चुने हुए महीने और व्यवसाय के रिकॉर्ड के आधार पर।"
      : "Based on the selected business and reporting month.",
    facts: [],
    note: hotel?.notes || fleet!.basis,
  };
  if (task === "help")
    return {
      ...answer,
      title: hi
        ? "मैं कैसे मदद कर सकता हूँ"
        : "Operational assistant capabilities",
      summary: hi
        ? "मैं सारांश, दर्ज आय, उपलब्धता के रिकॉर्ड और उपलब्ध योजना परिणाम समझा सकता हूँ।"
        : "Ask for a business summary, recorded revenue, booked occupancy/fleet utilisation or available planning results. This is a guided record tool, not a live language model.",
      facts: [
        {
          label: hi ? "कार्रवाई की स्थिति" : "Action status",
          value:
            "No booking, payment, refund, guest movement, record change or outgoing message was performed.",
        },
      ],
      note: "Questions and responses are not saved by this assistant. No paid AI or external service is called. Use the existing reviewed workflow for changes.",
    };
  if (task === "planning") {
    const base = hotel?.baseline || fleet!.baseline;
    answer.title = hi ? "योजना की स्थिति" : "Recorded-demand planning";
    if (!base.available) {
      answer.summary = hi
        ? "भरोसेमंद अनुमान के लिए पर्याप्त रिकॉर्ड नहीं हैं।"
        : "Insufficient history for a reliable planning baseline.";
      answer.facts = [{ label: "Demand baseline", value: base.reason }];
    } else {
      answer.summary =
        "Seasonal baseline of recorded requests, not guaranteed bookings or market demand.";
      answer.facts = base.forecasts.map((f) => ({
        label: `${f.horizon}-day recorded requests`,
        value: `${f.expected} · historical sample range ${f.lower}–${f.upper}`,
      }));
      answer.facts.push({
        label: "Historical validation",
        value:
          base.oneDayMae === null
            ? "Not enough holdout history"
            : `One-day retrospective mean absolute error: ${base.oneDayMae}; this does not validate 30/90-day accuracy`,
      });
    }
    if (hotel)
      answer.facts.push({
        label: "Room occupancy outlook",
        value: hotel.occupancyOutlook.available
          ? "Available in Revenue & outlook; review configured future capacity and historical validation."
          : hotel.occupancyOutlook.reason,
      });
    if (base.available) answer.note += " " + base.method;
    return answer;
  }
  if (hotel) {
    const configured = hotel.nights.reduce((n, r) => n + r.allotment, 0),
      booked = hotel.nights.reduce((n, r) => n + r.booked, 0);
    if (task !== "availability")
      answer.facts.push(
        {
          label: hi
            ? "सकल सत्यापित कैप्चर"
            : "Recorded gross verified captures",
          value: inr(hotel.revenue?.gross || 0),
        },
        {
          label: "Capture count · UTC verification month",
          value: String(hotel.revenue?.captures || 0),
        },
      );
    if (task !== "revenue")
      answer.facts.push(
        { label: "Configured room nights", value: String(configured) },
        {
          label: "Confirmed provider-verified booked nights",
          value: String(booked),
        },
        {
          label: "Booked/configured room-night ratio",
          value: percent(booked, configured),
        },
        {
          label: "Inventory coverage",
          value: `${hotel.nights.length} configured dates; missing dates are unknown. This is not a live room quote.`,
        },
      );
  } else {
    const s = fleet!.summary;
    if (task !== "availability")
      answer.facts.push(
        { label: "Recorded net booked sales", value: inr(s?.bookedNet || 0) },
        { label: "Recorded trip expenses", value: inr(s?.expenses || 0) },
        {
          label: "Recorded direct contribution · not net profit",
          value: inr((s?.bookedNet || 0) - (s?.expenses || 0)),
        },
        {
          label: "Documented verified collections",
          value: inr(s?.verifiedCollections || 0),
        },
      );
    if (task !== "revenue") {
      const reserved = fleet!.days.reduce((n, d) => n + d.occupied, 0),
        capacity = fleet!.fleet * fleet!.days.length;
      answer.facts.push(
        { label: "Active fleet today", value: String(fleet!.fleet) },
        {
          label: "Reserved/current-fleet vehicle days",
          value: `${reserved} / ${capacity}`,
        },
        {
          label: "Recorded full-vehicle utilisation",
          value: percent(reserved, capacity),
        },
      );
    }
  }
  return answer;
}
