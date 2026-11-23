import { db, d1Binding } from "../db";
import { scope, type Actor } from "../access";
import { HttpError } from "../http";
import { balances, inr, quoteTotal } from "../money";
import { packageItineraryDraft } from "../workspace-operations/itinerary-format";
import { publicSearch } from "../marketplace/business";
import { assistantActor } from "./store";
import type { AssistantInput, Plan, ToolResult } from "./contracts";
export async function executeAssistantTool(
  actor: Actor,
  v: AssistantInput,
  plan: Plan,
): Promise<ToolResult> {
  const a = await assistantActor(actor),
    asOf = new Date().toISOString(),
    hi = plan.language === "hi";
  const liveAgency = {
    users: { some: { id: a.id, disabled: false, role: a.role } },
    demo: false,
  };
  const liveScope = { ...scope(a), agency: liveAgency };
  const result = (
    title: string,
    summary: string,
    items: ToolResult["items"] = [],
    extra: Partial<ToolResult> = {},
  ): ToolResult => ({
    tool: plan.tool,
    title,
    summary,
    items,
    source: "Authorised CRM records",
    asOf,
    note: hi
      ? "दर्ज जानकारी की समीक्षा करें। किसी ग्राहक को संदेश या भुगतान अनुरोध नहीं भेजा गया है।"
      : "Review these recorded facts. No customer message, payment request or booking action has been sent or executed.",
    ...extra,
  });
  if (plan.tool === "help")
    return result(
      hi ? "मैं कैसे मदद कर सकता हूँ" : "How I can help",
      hi
        ? "मैं आपकी अनुमति वाले रिकॉर्ड से पैकेज, पूछताछ, फॉलो-अप और ड्राफ्ट तैयार करने में मदद कर सकता हूँ। नीचे काम और उसका संदर्भ चुनें।"
        : "I can look up permitted records and prepare work for review. Choose a task and its enquiry, package or booking context below. Guided mode uses supported tools, not a general-purpose language model.",
      [
        {
          id: "drafts",
          label: hi ? "योजना और कोटेशन" : "Plan and quote",
          detail:
            "Maintained package facts → itinerary draft → recorded-rate quotation preview → existing review form.",
        },
        {
          id: "operations",
          label: hi ? "ग्राहक और बुकिंग" : "Customers and bookings",
          detail:
            "Selected enquiry, recorded follow-ups, booking status and current approved supplier lookup.",
        },
        {
          id: "limits",
          label: hi ? "अभी सक्रिय नहीं" : "Actions remain controlled",
          detail:
            "This chat does not send messages, create payment links, confirm bookings, charge, refund or activate subscriptions. Live AI needs approved provider setup.",
        },
      ],
      {
        source: "Assistant capabilities",
        note: hi
          ? "किसी ग्राहक रिकॉर्ड या भुगतान में बदलाव नहीं किया गया।"
          : "No customer record or financial action was changed. Unsupported questions return this help; they are not treated as completed tasks.",
      },
    );
  const lead = async () => {
    if (!v.leadId) throw new HttpError(400, "Choose an enquiry for this tool");
    const l = await db.lead.findFirst({
      where: { ...liveScope, id: v.leadId },
      select: {
        id: true,
        customer: true,
        destination: true,
        stage: true,
        travellers: true,
        travelStart: true,
        travelEnd: true,
        budget: true,
        email: true,
        phone: true,
      },
    });
    if (!l)
      throw new HttpError(404, "Enquiry not found in your permitted records");
    return l;
  };
  const pkg = async () => {
    if (!v.packageId)
      throw new HttpError(400, "Choose a maintained package for this draft");
    const p = await db.package.findFirst({
      where: { agencyId: a.agencyId, agency: liveAgency, id: v.packageId },
      select: {
        id: true,
        name: true,
        destination: true,
        days: true,
        itinerary: true,
        inclusions: true,
        exclusions: true,
        paymentTerms: true,
        cancellationTerms: true,
        price: true,
      },
    });
    if (!p) throw new HttpError(404, "Package not found");
    return p;
  };
  if (plan.tool === "packages") {
    const rows = await db.package.findMany({
      where: { agencyId: a.agencyId, agency: liveAgency },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        destination: true,
        days: true,
        price: true,
      },
      take: 50,
    });
    const q = plan.query.trim().toLowerCase();
    const matching = rows.filter(
      (p) => !q || `${p.name} ${p.destination}`.toLowerCase().includes(q),
    );
    return result(
      hi ? "आपके पैकेज" : "Maintained packages",
      hi
        ? "अपनी एजेंसी के दर्ज पैकेज देखें।"
        : "Matching packages from the first 50 maintained records, ordered by name. These are agency rates, not verified supplier inventory.",
      matching.slice(0, 10).map((p) => ({
        id: p.id,
        label: p.name,
        detail: `${p.destination} · ${p.days} days · ${inr(p.price)} / traveller`,
      })),
      { next: { page: "Packages" } },
    );
  }
  if (plan.tool === "lead") {
    const l = await lead();
    return result(
      hi ? "पूछताछ की जानकारी" : "Selected enquiry",
      `${l.customer} · ${l.destination}`,
      [
        {
          id: l.id,
          label: `${l.stage} · ${l.travellers} travellers`,
          detail: `${l.travelStart.toISOString().slice(0, 10)} → ${l.travelEnd.toISOString().slice(0, 10)} · budget ${inr(l.budget)} / traveller`,
        },
        {
          id: "contact",
          label: "Recorded contact",
          detail:
            [l.email, l.phone].filter(Boolean).join(" · ") ||
            "No contact recorded",
        },
      ],
      { next: { page: "Enquiries", leadId: l.id } },
    );
  }
  if (plan.tool === "itinerary" || plan.tool === "quotation") {
    const l = await lead(),
      p = await pkg();
    if (["Won", "Lost"].includes(l.stage))
      throw new HttpError(409, "Choose an open enquiry for a new draft");
    if (l.destination.toLowerCase() !== p.destination.toLowerCase())
      throw new HttpError(
        409,
        "The selected package destination does not match the enquiry. Review the source package first",
      );
    if (plan.tool === "itinerary") {
      if (
        p.days > 60 ||
        p.itinerary.length > 3000 ||
        p.inclusions.length > 5000 ||
        p.exclusions.length > 5000 ||
        p.paymentTerms.length + p.cancellationTerms.length + 2 > 6000
      )
        throw new HttpError(
          400,
          "Use the itinerary editor to review this source package in smaller sections",
        );
      const draft = packageItineraryDraft(
          p,
          l.travelStart.toISOString().slice(0, 10),
          l.travelEnd.toISOString().slice(0, 10),
          l.travellers,
        ),
        text = [
          draft.title,
          `${draft.startDate} → ${draft.endDate} · ${draft.travellers} travellers`,
          ...draft.days.map((d) => `Day ${d.day}: ${d.title}\n${d.notes}`),
          `Inclusions: ${draft.inclusions}`,
          `Exclusions: ${draft.exclusions}`,
          `Terms: ${draft.terms}`,
        ].join("\n\n");
      return result(
        hi
          ? "यात्रा का समीक्षा योग्य ड्राफ्ट"
          : "Package-grounded itinerary draft",
        hi
          ? "इस ड्राफ्ट को सेव करने से पहले तारीखों और गतिविधियों की समीक्षा करें।"
          : "Source package text has been arranged into a reviewable draft. Missing daily detail remains explicit; no activities, prices or availability were invented.",
        [],
        {
          draft: { kind: "itinerary", text, leadId: l.id, packageId: p.id },
          next: {
            page: "Itineraries & costing",
            leadId: l.id,
            packageId: p.id,
          },
        },
      );
    }
    if (p.price <= 0)
      throw new HttpError(
        409,
        "Maintain a positive selling rate before preparing a quotation",
      );
    let total: number;
    try {
      total = quoteTotal(p.price, l.travellers, 0, 0);
    } catch {
      throw new HttpError(
        400,
        "Review the group size and recorded rate; the supported quotation amount was exceeded",
      );
    }
    const text = [
      `${p.name} · ${p.destination}`,
      `${l.travellers} travellers · ${l.travelStart.toISOString().slice(0, 10)} → ${l.travelEnd.toISOString().slice(0, 10)}`,
      `Recorded selling rate: ${inr(p.price)} / traveller`,
      `Before tax/discount: ${inr(total)}`,
      `Inclusions: ${p.inclusions}`,
      `Exclusions: ${p.exclusions}`,
      `Payment terms: ${p.paymentTerms || "Confirm with agency"}`,
      `Cancellation terms: ${p.cancellationTerms || "Confirm with agency"}`,
      "Quotation preview only. Select tax/discount and review final terms in the quotation builder.",
    ].join("\n\n");
    return result(
      hi ? "कोटेशन की समीक्षा" : "Recorded-rate quotation preview",
      hi
        ? "अंतिम कीमत, टैक्स और शर्तें बिल्डर में चुनें।"
        : "Calculated by the backend from the maintained selling rate. No quote has been saved, approved or booked.",
      [{ id: p.id, label: "Before tax / discount", detail: inr(total) }],
      {
        draft: { kind: "quotation", text, leadId: l.id, packageId: p.id },
        next: { page: "Quotations", leadId: l.id, packageId: p.id },
      },
    );
  }
  if (plan.tool === "followups") {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    if (v.leadId) {
      const l = await lead();
      if (["Won", "Lost"].includes(l.stage))
        throw new HttpError(
          409,
          "Closed enquiries are not included in active follow-up drafts",
        );
      return result(
        hi ? "फ़ॉलो-अप ड्राफ्ट" : "Follow-up draft",
        hi
          ? "संदेश को भेजने से पहले समीक्षा और संपादन करें।"
          : "Editable copy only. Delivery and task completion remain separate explicit actions.",
        [],
        {
          draft: {
            kind: "followup",
            leadId: l.id,
            text: hi
              ? `नमस्ते ${l.customer}, आपकी ${l.destination} यात्रा की योजना के बारे में बात करना चाहेंगे। कृपया सही तारीखें और अपनी प्राथमिकताएं बताएं।`
              : `Hello ${l.customer}, checking in about your ${l.destination} travel plans. Please confirm your preferred dates and requirements so we can prepare a considered proposal.`,
          },
          next: { page: "Enquiries", leadId: l.id },
        },
      );
    }
    const rows = await db.lead.findMany({
      where: {
        ...liveScope,
        stage: { notIn: ["Won", "Lost"] },
        followUp: { lte: new Date(today + "T23:59:59.999Z") },
      },
      orderBy: { followUp: "asc" },
      select: { id: true, customer: true, destination: true, followUp: true },
      take: 10,
    });
    return result(
      hi ? "आज के फ़ॉलो-अप" : "Due follow-ups",
      hi
        ? "पहली 10 लंबित पूछताछ; यह मॉडल स्कोर नहीं है।"
        : "Up to 10 due/overdue open enquiries from recorded follow-up dates. This is a transparent rule, not an ML ranking.",
      rows.map((l) => ({
        id: l.id,
        label: l.customer,
        detail: `${l.destination} · ${l.followUp?.toISOString().slice(0, 10)}`,
      })),
      { next: { page: "Enquiries" } },
    );
  }
  if (plan.tool === "booking" || plan.tool === "payment") {
    if (!v.bookingId)
      throw new HttpError(
        400,
        "Choose a booking to review its recorded status and balance",
      );
    const b = await db.booking.findFirst({
      where: { agencyId: a.agencyId, id: v.bookingId, lead: liveScope },
      select: {
        id: true,
        leadId: true,
        status: true,
        supplierStatus: true,
        total: true,
        cancellationFee: true,
        lead: { select: { customer: true } },
        transactions: {
          where: { kind: { in: ["Receipt", "Refund"] } },
          select: { kind: true, amount: true },
        },
      },
    });
    if (!b)
      throw new HttpError(404, "Booking not found in your permitted records");
    const amount = balances(b).customerDue;
    return result(
      hi ? "दर्ज बुकिंग और भुगतान" : "Recorded booking and balance",
      `${b.lead.customer} · ${b.status} · supplier ${b.supplierStatus}`,
      [{ id: b.id, label: "Recorded customer balance", detail: inr(amount) }],
      {
        next: { page: "Bookings", leadId: b.leadId },
        note:
          plan.tool === "payment"
            ? "No payment link was created. These are manual CRM balances, not verified bank payments. Review the booking and your authorised payment provider setup before requesting payment. This assistant cannot capture funds or confirm inventory."
            : "Agency booking/supplier statuses are manually recorded. This is not independent verification of external inventory or bank payment. No booking state was changed.",
      },
    );
  }
  if (!d1Binding())
    throw new HttpError(
      503,
      "Supplier inventory requires the configured D1 marketplace runtime",
    );
  if (!v.city || !v.start || !v.end)
    throw new HttpError(
      400,
      "Choose a city, start date and end date for a current supplier lookup",
    );
  const search = await publicSearch({
    kind: v.supplierKind,
    city: v.city,
    start: v.start,
    end: v.end,
  });
  return result(
    hi ? "सप्लायर की ताज़ा जानकारी" : "Current supplier lookup",
    hi
      ? "सूची और कैलेंडर की जानकारी देखें; कोई कमरा या वाहन होल्ड नहीं किया गया है।"
      : "Approved supplier listings and matching vehicle calendar results. No room or vehicle has been reserved.",
    [
      ...search.businesses.map((b) => ({
        id: b.id,
        label: b.name,
        detail: `${b.kind} · ${b.city}`,
      })),
      ...search.vehicles.slice(0, 10).map((v) => ({
        id: String(v.id),
        label: String(v.name),
        detail: `${String(v.capacity)} capacity · maintained ${String(v.pricing)} rate ${inr(Number(v.ratePaise))}`,
      })),
    ].slice(0, 20),
    {
      source: "Live D1 marketplace lookup",
      note: "Vehicle results reflect the date calendar at lookup time; prices require the full trip/km quotation. Hotel approval does not assert room availability: continue to the room-specific quotation in the marketplace. No inventory hold, supplier confirmation or payment has been performed.",
    },
  );
}
