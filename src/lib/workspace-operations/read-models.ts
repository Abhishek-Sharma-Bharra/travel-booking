import type { Dataset } from "../data";
import { balances, inr } from "../money";
import { calendarDate } from "../reporting-time";
import { seasonalBaseline } from "./baseline";
export function customerHistory(data: Dataset, leadId: string) {
  const current = data.leads.find((l) => l.id === leadId);
  if (!current) return null;
  const email = (s: string) => s.trim().toLowerCase(),
    phone = (s: string) => s.replace(/[ ()-]/g, "");
  const related = data.leads.filter(
    (l) =>
      l.id === current.id ||
      (!!current.email && email(l.email) === email(current.email)) ||
      (!!current.phone && phone(l.phone) === phone(current.phone)),
  );
  const ids = new Set(related.map((l) => l.id)),
    bookings = data.bookings.filter((b) => ids.has(b.leadId)),
    quotes = data.quotes.filter((q) => ids.has(q.leadId));
  const timeline = [
    ...related.map((l) => ({
      id: `lead:${l.id}`,
      at: l.createdAt,
      title: "Enquiry recorded",
      detail: `${l.externalId} · ${l.destination}`,
      leadId: l.id,
    })),
    ...data.activities
      .filter((e) => e.leadId && ids.has(e.leadId))
      .map((e) => ({
        id: `event:${e.id}`,
        at: e.createdAt,
        title: e.action,
        detail: "Recorded activity",
        leadId: e.leadId!,
      })),
    ...quotes.map((q) => ({
      id: `quote:${q.id}`,
      at: q.createdAt,
      title: `Quotation version ${q.version} created`,
      detail: `${q.packageName}`,
      leadId: q.leadId,
    })),
    ...bookings.map((b) => ({
      id: `booking:${b.id}`,
      at: b.createdAt,
      title: "Booking created",
      detail: `Current status: ${b.status}`,
      leadId: b.leadId,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { current, related, bookings, quotes, timeline };
}
export function departureEvents(data: Dataset, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  return data.bookings
    .filter((b) => b.status !== "Cancelled")
    .flatMap((b) => {
      const lead = data.leads.find((l) => l.id === b.leadId);
      if (!lead) return [];
      return [
        {
          day: b.travelStart.slice(0, 10),
          kind: "Departure",
          bookingId: b.id,
          customer: lead.customer,
          destination: lead.destination,
          status: b.status,
        },
        {
          day: b.travelEnd.slice(0, 10),
          kind: "Return",
          bookingId: b.id,
          customer: lead.customer,
          destination: lead.destination,
          status: b.status,
        },
      ].filter((e) => e.day.startsWith(month));
    })
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) || a.customer.localeCompare(b.customer),
    );
}
export function supplierBalances(data: Dataset) {
  if (!data.access.canViewCosts) return [];
  const groups = new Map<
    string,
    {
      name: string;
      cost: number;
      paid: number;
      due: number;
      bookingIds: Set<string>;
      entries: number;
    }
  >();
  for (const b of data.bookings)
    for (const t of b.transactions) {
      if (
        ![
          "Expense",
          "Supplier credit",
          "Supplier payment",
          "Supplier refund",
        ].includes(t.kind)
      )
        continue;
      const name = t.supplier.trim() || "Unassigned supplier",
        key = name.toLowerCase();
      const row = groups.get(key) ?? {
        name,
        cost: 0,
        paid: 0,
        due: 0,
        bookingIds: new Set<string>(),
        entries: 0,
      };
      row.bookingIds.add(b.id);
      row.entries++;
      if (t.kind === "Expense") row.cost += t.amount;
      if (t.kind === "Supplier credit") row.cost -= t.amount;
      if (t.kind === "Supplier payment") row.paid += t.amount;
      if (t.kind === "Supplier refund") row.paid -= t.amount;
      row.due = row.cost - row.paid;
      groups.set(key, row);
    }
  return [...groups.values()]
    .sort((a, b) => b.due - a.due)
    .map((r) => ({ ...r, bookingIds: [...r.bookingIds] }));
}
export function agencyBaseline(data: Dataset, asOf: string) {
  const zone = data.agency.timezone || "Asia/Kolkata",
    demo = data.demo;
  const day = (s: string) => calendarDate(new Date(s), zone);
  const events = demo
    ? data.leads.map((l) => ({ day: day(l.enquiryDate), count: 1 }))
    : data.leads.map((l) => ({ day: day(l.createdAt), count: 1 }));
  const coverage = demo
    ? [...events].sort((a, b) => a.day.localeCompare(b.day))[0]?.day || asOf
    : day(data.agency.createdAt);
  return {
    result: seasonalBaseline(events, asOf, coverage),
    demo,
    target: demo
      ? "Fictional enquiry history"
      : "New enquiry records captured in this CRM",
    scope:
      "Current authorised dataset; imported/backdated records and assignment changes can affect the pattern. This is a planning baseline, not a validated demand model.",
  };
}
export const advisorQuestions = [
  "Which enquiries need follow-up?",
  "What collections remain due?",
  "Which packages have reconciled contribution?",
  "What do the recorded enquiry sources show?",
] as const;
export function guidedBusinessAnswer(
  data: Dataset,
  question: string,
  today: string,
) {
  if (question === advisorQuestions[0]) {
    const leads = data.leads
      .filter(
        (l) =>
          !["Won", "Lost"].includes(l.stage) &&
          l.followUp &&
          l.followUp.slice(0, 10) <= today,
      )
      .sort((a, b) => String(a.followUp).localeCompare(String(b.followUp)));
    return {
      title: "Due follow-ups",
      answer: leads.length
        ? `${leads.length} open enquiries have a due or overdue recorded follow-up.`
        : "No due follow-ups are recorded in your accessible enquiries.",
      rows: leads
        .slice(0, 10)
        .map(
          (l) =>
            `${l.customer} · ${l.destination} · due ${l.followUp!.slice(0, 10)}`,
        ),
      basis: "Open stages and recorded follow-up dates; not an ML ranking.",
    };
  }
  if (question === advisorQuestions[1]) {
    const due = data.bookings.reduce((n, b) => n + balances(b).customerDue, 0);
    return {
      title: "Recorded customer balances",
      answer: `${due} paise remains due across your accessible booking records.`,
      amount: due,
      rows: data.bookings
        .filter((b) => balances(b).customerDue > 0)
        .slice(0, 10)
        .map(
          (b) =>
            `${data.leads.find((l) => l.id === b.leadId)?.customer || "Booking"} · ${b.id}`,
        ),
      basis:
        "Current booking sales less recorded receipts plus refunds. Bank reconciliation is separate.",
    };
  }
  if (question === advisorQuestions[2]) {
    if (!data.access.canViewCosts)
      return {
        title: "Permission required",
        answer:
          "Supplier costs and contribution are available only to owners and managers.",
        rows: [],
        basis: "Your role's financial restrictions remain enforced.",
      };
    const complete = data.bookings.filter((b) => b.directCostsComplete);
    const groups = new Map<string, number>();
    for (const b of complete) {
      const name = b.quote.packageName;
      groups.set(name, (groups.get(name) ?? 0) + balances(b).contribution);
    }
    return {
      title: "Reconciled direct-cost contribution",
      answer: complete.length
        ? `${complete.length} bookings are marked as having reconciled direct costs. Operating spend and taxes still need separate review.`
        : "No bookings have reconciled direct-cost coverage yet; a profit ranking would be misleading.",
      rows: [...groups]
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => `${name}: ${inr(value)} recorded contribution`),
      basis:
        "Sales minus recorded supplier expenses plus credits, restricted to directCostsComplete. This is not certified net profit.",
    };
  }
  if (question === advisorQuestions[3]) {
    const counts = new Map<string, number>();
    for (const lead of data.leads)
      counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);
    return {
      title: "Enquiry source mix",
      answer: `${data.leads.length} accessible enquiry records are included.`,
      rows: [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([source, n]) => `${source}: ${n} enquiries`),
      basis:
        "Recorded enquiry sources; these counts do not establish campaign ROI or causation. See Marketing/Integrations for verified spend and attribution.",
    };
  }
  return {
    title: "Choose a supported question",
    answer:
      "This guided advisor answers the listed questions from your authorised records. Open-ended paid AI is not enabled here.",
    rows: [],
    basis: "No external action or booking confirmation is performed.",
  };
}
