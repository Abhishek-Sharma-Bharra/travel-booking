import type { Dataset } from "../data";
import { calendarDate } from "../reporting-time";

// Conservative equality only. Never infer a country code or merge people/records.
export function contactKey(kind: "email" | "phone", value: string) {
  if (kind === "email") {
    const email = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }
  if (!/^[+\d ()-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}
export function crmReview(data: Dataset, now = new Date()) {
  if (!Number.isFinite(+now)) throw new Error("Invalid review date");
  const today = calendarDate(now, data.agency.timezone || "Asia/Kolkata");
  // Defense in depth: use only the current agency and agent's assigned enquiries.
  const leads = data.leads.filter(
    (l) =>
      l.agencyId === data.agency.id &&
      (data.actor.role !== "AGENT" || l.assignedId === data.actor.id),
  );
  const ids = new Set(leads.map((l) => l.id));
  const booked = new Set(
    data.bookings
      .filter(
        (b) =>
          b.agencyId === data.agency.id &&
          ids.has(b.leadId) &&
          b.status !== "Cancelled",
      )
      .map((b) => b.leadId),
  );
  const groups = new Map<
    string,
    { kind: "email" | "phone"; value: string; leadIds: string[] }
  >();
  const losses = new Map<string, { reason: string; count: number }>();
  const employees = new Map<
    string,
    { id: string; name: string; enquiries: number; won: number; lost: number }
  >();
  const sources = new Map<
    string,
    { name: string; enquiries: number; won: number; lost: number }
  >();
  const people = new Map(data.users.map((u) => [u.id, u.name]));
  const rows = leads.map((l) => {
    for (const kind of ["email", "phone"] as const) {
      const value = contactKey(kind, l[kind]);
      if (!value) continue;
      const key = `${kind}:${value}`;
      const group = groups.get(key) || { kind, value, leadIds: [] };
      group.leadIds.push(l.id);
      groups.set(key, group);
    }
    if (l.stage === "Lost") {
      const reason = l.lostReason.trim() || "No reason recorded";
      const key = reason.toLowerCase();
      const row = losses.get(key) || { reason, count: 0 };
      row.count++;
      losses.set(key, row);
    }
    const employee = employees.get(l.assignedId) || {
      id: l.assignedId,
      name: people.get(l.assignedId) || "Unavailable team member",
      enquiries: 0,
      won: 0,
      lost: 0,
    };
    const source = sources.get(l.source) || {
      name: l.source,
      enquiries: 0,
      won: 0,
      lost: 0,
    };
    for (const r of [employee, source]) {
      r.enquiries++;
      if (l.stage === "Won") r.won++;
      if (l.stage === "Lost") r.lost++;
    }
    employees.set(l.assignedId, employee);
    sources.set(l.source, source);
    const overdue =
      !["Won", "Lost"].includes(l.stage) &&
      !!l.followUp &&
      l.followUp.slice(0, 10) < today;
    const segment =
      l.stage === "Lost"
        ? "Closed lost"
        : l.repeatCustomer === true
          ? "Recorded repeat"
          : booked.has(l.id)
            ? "Active booking"
            : "Prospective";
    return {
      id: l.id,
      externalId: l.externalId,
      customer: l.customer,
      destination: l.destination,
      stage: l.stage,
      segment,
      overdue,
      followUp: l.followUp?.slice(0, 10) || "",
    };
  });
  const duplicateGroups = [...groups.values()]
    .filter((g) => g.leadIds.length > 1)
    .sort(
      (a, b) =>
        b.leadIds.length - a.leadIds.length || a.value.localeCompare(b.value),
    );
  const duplicateIds = new Set(duplicateGroups.flatMap((g) => g.leadIds));
  const segments = [
    "Prospective",
    "Active booking",
    "Recorded repeat",
    "Closed lost",
  ].map((name) => ({
    name,
    count: rows.filter((r) => r.segment === name).length,
  }));
  const sorted = <T extends { enquiries: number; name: string }>(
    values: Iterable<T>,
  ) =>
    [...values].sort(
      (a, b) => b.enquiries - a.enquiries || a.name.localeCompare(b.name),
    );
  return {
    today,
    rows,
    segments,
    duplicateGroups,
    duplicateIds: [...duplicateIds],
    overdue: rows.filter((r) => r.overdue).length,
    lost: leads.filter((l) => l.stage === "Lost").length,
    losses: [...losses.values()].sort(
      (a, b) => b.count - a.count || a.reason.localeCompare(b.reason),
    ),
    employees: sorted(employees.values()),
    sources: sorted(sources.values()),
  };
}
