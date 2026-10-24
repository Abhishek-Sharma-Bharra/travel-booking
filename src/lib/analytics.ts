import type { Dataset } from "./data";
import { balances, indiaToday } from "./money";
export type Filters = {
  from: string;
  to: string;
  destination: string;
  source: string;
  salesperson: string;
  search: string;
};
export function defaultFilters(): Filters {
  const now = new Date();
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1))
      .toISOString()
      .slice(0, 10),
    to: indiaToday(),
    destination: "",
    source: "",
    salesperson: "",
    search: "",
  };
}
export function analyse(data: Dataset, f: Filters) {
  const within = (date: string) =>
    date.slice(0, 10) >= f.from && date.slice(0, 10) <= f.to;
  const dimension = (l: Dataset["leads"][number]) =>
    (!f.destination || l.destination === f.destination) &&
    (!f.source || l.source === f.source) &&
    (!f.salesperson || l.assignedId === f.salesperson) &&
    (!f.search ||
      [l.customer, l.externalId, l.destination]
        .join(" ")
        .toLowerCase()
        .includes(f.search.toLowerCase()));
  const dimensionLeads = data.leads.filter(dimension),
    ids = new Set(dimensionLeads.map((l) => l.id));
  const leads = dimensionLeads.filter((l) => within(l.enquiryDate)),
    bookings = data.bookings.filter(
      (b) => ids.has(b.leadId) && within(b.createdAt),
    );
  const valid = bookings.filter((b) => b.status !== "Cancelled");
  const allBookings = data.bookings.filter((b) => ids.has(b.leadId));
  const collected = allBookings
    .flatMap((b) => b.transactions)
    .filter((t) => within(t.date))
    .reduce(
      (s, t) =>
        s +
        (t.kind === "Receipt" ? t.amount : t.kind === "Refund" ? -t.amount : 0),
      0,
    );
  const sales = bookings.reduce((s, b) => s + balances(b).sales, 0),
    due = bookings.reduce((s, b) => s + balances(b).customerDue, 0),
    contribution = bookings.reduce((s, b) => s + balances(b).contribution, 0);
  const overdue = dimensionLeads.filter(
    (l) =>
      !["Won", "Lost"].includes(l.stage) &&
      l.followUp &&
      l.followUp.slice(0, 10) < indiaToday(),
  );
  const ad = data.spends.filter(
    (s) =>
      s.kind === "Advertising" &&
      s.month >= f.from.slice(0, 7) &&
      s.month <= f.to.slice(0, 7) &&
      (!f.source || s.channel === f.source),
  );
  const adSpend = ad.reduce((s, r) => s + r.amount, 0);
  const ops = data.spends
    .filter(
      (s) =>
        s.kind === "Operating" &&
        s.month >= f.from.slice(0, 7) &&
        s.month <= f.to.slice(0, 7),
    )
    .reduce((s, r) => s + r.amount, 0);
  const sourceStats = [
    "Meta Ads",
    "Google Ads",
    "WhatsApp",
    "Referral",
    "Website",
    "Walk-in",
  ].map((source) => {
    const ls = leads.filter((l) => l.source === source),
      lsids = new Set(ls.map((l) => l.id));
    const bs = allBookings.filter(
      (b) => lsids.has(b.leadId) && b.status !== "Cancelled",
    );
    const sales = bs.reduce((s, b) => s + b.total, 0),
      spend = ad
        .filter((s) => s.channel === source)
        .reduce((s, r) => s + r.amount, 0);
    return {
      source,
      enquiries: ls.length,
      bookings: bs.length,
      sales,
      spend,
      cpl:
        !f.destination && !f.salesperson && ls.length && spend
          ? Math.round(spend / ls.length)
          : null,
      cac:
        !f.destination && !f.salesperson && bs.length && spend
          ? Math.round(spend / bs.length)
          : null,
      roas: !f.destination && !f.salesperson && spend ? sales / spend : null,
    };
  });
  const packages = data.packages.map((p) => {
    const bs = bookings.filter((b) => b.quote.packageId === p.id);
    return {
      name: p.name,
      destination: p.destination,
      bookings: bs.length,
      sales: bs.reduce((s, b) => s + balances(b).sales, 0),
      cost: bs.reduce((s, b) => s + balances(b).supplierCost, 0),
      contribution: bs.reduce((s, b) => s + balances(b).contribution, 0),
    };
  });
  const monthKeys = [
    ...new Set([
      ...leads.map((l) => l.enquiryDate.slice(0, 7)),
      ...bookings.map((b) => b.createdAt.slice(0, 7)),
    ]),
  ].sort();
  const monthly = monthKeys.map((month) => ({
    month,
    enquiries: leads.filter((l) => l.enquiryDate.startsWith(month)).length,
    sales: bookings
      .filter((b) => b.createdAt.startsWith(month))
      .reduce((s, b) => s + balances(b).sales, 0),
    contribution: bookings
      .filter((b) => b.createdAt.startsWith(month))
      .reduce((s, b) => s + balances(b).contribution, 0),
  }));
  const won = leads.filter((l) =>
    allBookings.some((b) => b.leadId === l.id && b.status !== "Cancelled"),
  ).length;
  const completedFollowups = data.activities.filter(
    (x) =>
      x.action.startsWith("Follow-up completed") &&
      within(x.createdAt) &&
      x.leadId &&
      ids.has(x.leadId),
  ).length;
  return {
    leads,
    bookings,
    valid,
    collected,
    sales,
    due,
    contribution,
    overdue,
    adSpend,
    ops,
    sourceStats,
    packages,
    monthly,
    conversion: leads.length ? won / leads.length : 0,
    completedFollowups,
  };
}
