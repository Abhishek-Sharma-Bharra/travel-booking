import type { Prisma, Lead } from "@prisma/client";
import type { Actor } from "../access";
import { HttpError } from "../http";
import { D1Unit } from "../d1/unit";
import { itineraryPayloadSchema, itineraryTotals } from "./itinerary-format";
import { inr, quoteTotal } from "../money";
type Source = {
  versionId: string;
  revision: number;
  payload: string;
  leadId: string;
  packageId: string | null;
  existingQuoteId: string | null;
};
export async function itineraryQuoteSource(
  a: Actor,
  versionId: string,
  lead: Lead,
  packageId: string,
  context: D1Unit | Prisma.TransactionClient,
) {
  if (process.env.WORKSPACE_OPERATIONS_ENABLED !== "true")
    throw new HttpError(404, "Workspace operations are not enabled");
  const sql = `SELECT v.id AS "versionId",v.revision,v.payload,i."leadId",i."packageId",q."quoteId" AS "existingQuoteId" FROM "WorkspaceItineraryVersion" v JOIN "WorkspaceItinerary" i ON i.id=v."itineraryId" AND i."agencyId"=v."agencyId" JOIN "Lead" l ON l.id=i."leadId" AND l."agencyId"=i."agencyId" JOIN "User" u ON u.id=$1 AND u."agencyId"=i."agencyId" AND NOT u.disabled AND u.role IN('OWNER','MANAGER') LEFT JOIN "WorkspaceItineraryQuote" q ON q."versionId"=v.id AND q."agencyId"=i."agencyId" WHERE v.id=$2 AND i."agencyId"=$3 AND i."leadId"=$4 AND i."packageId"=$5 AND v.revision=i.revision`;
  const values = [a.id, versionId, a.agencyId, lead.id, packageId];
  let source: Source | undefined;
  if (context instanceof D1Unit) {
    const bind: unknown[] = [];
    source = (
      await context.db
        .prepare(
          sql.replace(/\$(\d+)/g, (_m, n) => {
            bind.push(values[Number(n) - 1]);
            return "?";
          }),
        )
        .bind(...bind)
        .all<Source>()
    ).results[0];
  } else {
    await context.$queryRaw`SELECT id FROM "User" WHERE id=${a.id} FOR SHARE`;
    source = (
      await context.$queryRawUnsafe<Source[]>(
        sql + " FOR SHARE OF i",
        ...values,
      )
    )[0];
  }
  if (!source)
    throw new HttpError(
      404,
      "Current itinerary version not found or manager permission unavailable",
    );
  const p = itineraryPayloadSchema.parse(JSON.parse(source.payload));
  if (
    p.startDate !== lead.travelStart.toISOString().slice(0, 10) ||
    p.endDate !== lead.travelEnd.toISOString().slice(0, 10) ||
    p.travellers !== lead.travellers
  )
    throw new HttpError(
      409,
      "Enquiry dates or travellers changed. Review and save an updated itinerary before quoting",
    );
  const totals = itineraryTotals(p);
  if (!p.costs.length || totals.selling <= 0 || totals.net <= 0)
    throw new HttpError(
      400,
      "Add and review positive itinerary costs before creating an itemized quotation",
    );
  const unitPrice = Math.ceil(totals.selling / lead.travellers),
    discount = p.discountPaise + unitPrice * lead.travellers - totals.selling;
  const total = quoteTotal(unitPrice, lead.travellers, discount, p.taxBps);
  if (total !== totals.total)
    throw Error("Itinerary quotation rounding mismatch");
  // Allocate markup exactly across customer-facing lines. Internal costs and
  // markup rates never appear in the printable customer proposal.
  const weights = p.costs.map(
    (r) => BigInt(r.quantity) * BigInt(r.unitCostPaise),
  );
  const extra = BigInt(totals.selling - totals.supplierCost),
    base = BigInt(totals.supplierCost);
  const parts = weights.map((w, i) => ({
    i,
    allocated: base ? (extra * w) / base : 0n,
    remainder: base ? (extra * w) % base : 0n,
  }));
  let remaining = extra - parts.reduce((n, r) => n + r.allocated, 0n);
  for (const row of [...parts].sort((x, y) =>
    x.remainder === y.remainder
      ? x.i - y.i
      : x.remainder > y.remainder
        ? -1
        : 1,
  )) {
    if (remaining <= 0n) break;
    row.allocated++;
    remaining--;
  }
  const lines = p.costs.map(
    (r, i) =>
      `${r.kind} · ${r.label} · quantity ${r.quantity}: ${inr(Number(weights[i] + parts[i].allocated))}`,
  );
  const proposal = [
    `${p.title} — reviewed itinerary version ${source.revision + 1}`,
    `Travel: ${p.startDate} to ${p.endDate}; ${p.travellers} travellers`,
    ...p.days.map(
      (d) =>
        `Day ${d.day}: ${d.title}\n${d.notes}${d.overnight ? "\nOvernight: " + d.overnight : ""}`,
    ),
    "Itemized selling amounts (INR):",
    ...lines,
    `Subtotal: ${inr(totals.selling)}`,
    `Discount: ${inr(p.discountPaise)}`,
    ...(discount > p.discountPaise
      ? [
          `Per-person allocation rounding adjustment: ${inr(discount - p.discountPaise)} is included in the recorded quotation discount; the itemized group total is unchanged.`,
        ]
      : []),
    `Tax: ${inr(totals.tax)}`,
    `Total: ${inr(total)}`,
    "Rates are agency quotations, not supplier inventory confirmations.",
  ].join("\n\n");
  if (proposal.length > 12000)
    throw new HttpError(
      400,
      "This itinerary is too long for a quotation proposal. Shorten day notes or provide the full itinerary as a separate reviewed document",
    );
  if (context instanceof D1Unit)
    context.guard(
      "SELECT COUNT(*)=1 FROM WorkspaceItineraryVersion v JOIN WorkspaceItinerary i ON i.id=v.itineraryId AND i.agencyId=v.agencyId WHERE v.id=? AND i.agencyId=? AND i.leadId=? AND i.packageId=? AND i.revision=v.revision",
      versionId,
      a.agencyId,
      lead.id,
      packageId,
    );
  return {
    unitPrice,
    discount,
    taxBps: p.taxBps,
    total,
    estimatedCost: totals.supplierCost,
    proposal,
    duration: p.days.length,
    inclusions: p.inclusions,
    exclusions: p.exclusions,
    versionId,
    existingQuoteId: source.existingQuoteId,
  };
}
export function itineraryQuoteLink(
  versionId: string,
  agencyId: string,
  leadId: string,
  quoteId: string,
) {
  return {
    sql: "INSERT INTO WorkspaceItineraryQuote (versionId,agencyId,leadId,quoteId,createdAt) VALUES (?,?,?,?,?)",
    values: [versionId, agencyId, leadId, quoteId, new Date().toISOString()],
  };
}
