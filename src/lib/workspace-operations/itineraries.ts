import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db, d1Binding } from "../db";
import type { Actor } from "../access";
import { HttpError } from "../http";
import { requireSubscription } from "../subscriptions";
import { type D1Statement } from "../d1/atomic";
import { encodeD1 } from "../d1/unit";
import {
  itineraryPayloadSchema,
  itineraryTotals,
  publicItineraryPayload,
  packageItineraryDraft,
  type ItineraryPayload,
} from "./itinerary-format";
const MAX_DOCUMENTS = 100,
  MAX_VERSIONS = 50;
const key = z.string().min(1).max(100);
const saveSchema = z
  .object({
    action: z.literal("save"),
    id: key.optional(),
    revision: z.number().int().min(0),
    requestId: z.uuid(),
    leadId: key,
    packageId: key.nullable(),
    payload: itineraryPayloadSchema,
  })
  .strict();
type ItineraryRow = {
  __role?: string;
  id: string;
  agencyId: string;
  leadId: string;
  packageId: string | null;
  title: string;
  startDate: string;
  daysCount: number;
  payload: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
async function query<T>(
  sql: string,
  values: unknown[],
  tx?: Prisma.TransactionClient,
): Promise<T[]> {
  const binding = d1Binding();
  if (binding) {
    const expanded: unknown[] = [];
    const native = sql.replace(/\$(\d+)/g, (_all, n) => {
      const index = Number(n) - 1;
      if (index >= values.length) throw Error("Missing internal SQL parameter");
      expanded.push(encodeD1(values[index]));
      return "?";
    });
    return (
      await binding
        .prepare(native)
        .bind(...expanded)
        .all<T>()
    ).results;
  }
  return (tx ?? db).$queryRawUnsafe<T[]>(sql, ...values);
}
async function currentActor(
  a: Actor,
  write = false,
  tx?: Prisma.TransactionClient,
) {
  if (write && a.demo) throw new HttpError(403, "Demo workspace is read-only");
  const user = await (tx ?? db).user.findUnique({
    where: { id: a.id },
    include: { agency: true },
  });
  if (
    !user ||
    user.disabled ||
    user.agencyId !== a.agencyId ||
    !user.agency ||
    user.agency.demo ||
    !["OWNER", "MANAGER", "AGENT"].includes(user.role)
  )
    throw new HttpError(403, "Workspace access unavailable");
  if (write) requireSubscription(user.agency);
  return { ...a, role: user.role };
}
const scopedJoin =
  'JOIN "Lead" l ON l.id=i."leadId" AND l."agencyId"=i."agencyId" JOIN "User" u ON u.id=$2 AND u."agencyId"=i."agencyId" AND NOT u.disabled';
const scopedWhere =
  'i."agencyId"=$1 AND (u.role<>\'AGENT\' OR l."assignedId"=u.id)';
function present(row: ItineraryRow, role: string) {
  const payload = itineraryPayloadSchema.parse(JSON.parse(row.payload)),
    totals = itineraryTotals(payload),
    costs = role !== "AGENT";
  const { __role: _role, ...publicRow } = row;
  return {
    ...publicRow,
    title: payload.title,
    startDate: payload.startDate,
    daysCount: payload.days.length,
    payload: publicItineraryPayload(payload, costs),
    totals: costs
      ? totals
      : {
          selling: totals.selling,
          net: totals.net,
          tax: totals.tax,
          total: totals.total,
        },
    canEdit: costs || !payload.costs.length,
    canViewCosts: costs,
  };
}
export async function itineraryOverview(
  actor: Actor,
  options: { id?: string; version?: string; page?: number } = {},
) {
  const a = await currentActor(actor),
    page = Math.max(0, Math.min(100, options.page ?? 0));
  if (!options.id) {
    const rows = await query<Omit<ItineraryRow, "payload">>(
      `SELECT i.id,i."leadId",i."packageId",i.title,i."startDate",i."daysCount",i.revision,i."createdAt",i."updatedAt",l.customer FROM "WorkspaceItinerary" i ${scopedJoin} WHERE ${scopedWhere} ORDER BY i."updatedAt" DESC,i.id LIMIT 21 OFFSET $3`,
      [a.agencyId, a.id, page * 20],
    );
    return {
      itineraries: rows.slice(0, 20),
      hasMore: rows.length > 20,
      page,
      limits: { documents: MAX_DOCUMENTS, versions: MAX_VERSIONS },
    };
  }
  const row = (
    await query<ItineraryRow>(
      `SELECT i.*,u.role AS "__role" FROM "WorkspaceItinerary" i ${scopedJoin} WHERE ${scopedWhere} AND i.id=$3`,
      [a.agencyId, a.id, key.parse(options.id)],
    )
  )[0];
  if (!row) throw new HttpError(404, "Itinerary not found");
  const versions = await query<{
    id: string;
    revision: number;
    createdAt: string;
  }>(
    `SELECT v.id,v.revision,v."createdAt" FROM "WorkspaceItineraryVersion" v JOIN "WorkspaceItinerary" i ON i.id=v."itineraryId" AND i."agencyId"=v."agencyId" ${scopedJoin} WHERE ${scopedWhere} AND i.id=$3 ORDER BY v.revision DESC LIMIT 50`,
    [a.agencyId, a.id, row.id],
  );
  const selected = options.version
    ? (
        await query<{
          payload: string;
          revision: number;
          createdAt: string;
          __role: string;
        }>(
          `SELECT v.payload,v.revision,v."createdAt",u.role AS "__role" FROM "WorkspaceItineraryVersion" v JOIN "WorkspaceItinerary" i ON i.id=v."itineraryId" AND i."agencyId"=v."agencyId" ${scopedJoin} WHERE ${scopedWhere} AND i.id=$3 AND v.id=$4`,
          [a.agencyId, a.id, row.id, key.parse(options.version)],
        )
      )[0]
    : null;
  if (options.version && !selected)
    throw new HttpError(404, "Itinerary version not found");
  return {
    itinerary: present(
      selected
        ? {
            ...row,
            payload: selected.payload,
            revision: selected.revision,
            updatedAt: selected.createdAt,
          }
        : row,
      selected?.__role ?? row.__role ?? a.role,
    ),
    versions,
    historical: !!selected,
  };
}
export async function itineraryCommand(actor: Actor, input: unknown) {
  if (
    input &&
    typeof input === "object" &&
    "action" in input &&
    input.action === "template"
  ) {
    const v = z
        .object({ action: z.literal("template"), leadId: key, packageId: key })
        .strict()
        .parse(input),
      a = await currentActor(actor);
    const lead = await db.lead.findFirst({
      where: {
        id: v.leadId,
        agencyId: a.agencyId,
        ...(a.role === "AGENT" ? { assignedId: a.id } : {}),
      },
    });
    const p = await db.package.findFirst({
      where: { id: v.packageId, agencyId: a.agencyId },
    });
    if (!lead || !p) throw new HttpError(404, "Enquiry or package not found");
    if (
      p.days > 60 ||
      p.itinerary.length > 3000 ||
      p.inclusions.length > 5000 ||
      p.exclusions.length > 5000 ||
      p.paymentTerms.length + p.cancellationTerms.length + 2 > 6000
    )
      throw new HttpError(
        400,
        "This package is too long for automatic copying. Split its itinerary into reviewed days manually; the source package is unchanged.",
      );
    return {
      payload: packageItineraryDraft(
        p,
        lead.travelStart.toISOString().slice(0, 10),
        lead.travelEnd.toISOString().slice(0, 10),
        lead.travellers,
      ),
      message:
        "Package text copied into a reviewable draft. Dates, sequencing, prices and inventory still need review.",
    };
  }
  const v = saveSchema.parse(input);
  try {
    itineraryTotals(v.payload);
  } catch {
    throw new HttpError(
      400,
      "Review itinerary costs, discount and the supported INR limit",
    );
  }
  const binding = d1Binding();
  async function save(tx?: Prisma.TransactionClient) {
    if (tx) {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id} FOR SHARE`;
    }
    const a = await currentActor(actor, true, tx);
    if (a.role === "AGENT" && (v.payload.costs.length || v.payload.markupBps))
      throw new HttpError(
        403,
        "Only an owner or manager can save supplier costing",
      );
    const lead = (
      await query<{ id: string }>(
        `SELECT l.id FROM "Lead" l JOIN "User" u ON u.id=$2 AND u."agencyId"=l."agencyId" AND NOT u.disabled WHERE l."agencyId"=$1 AND l.id=$3 AND (u.role<>'AGENT' OR l."assignedId"=u.id)${tx ? " FOR UPDATE OF l" : ""}`,
        [a.agencyId, a.id, v.leadId],
        tx,
      )
    )[0];
    if (!lead) throw new HttpError(404, "Enquiry not found");
    const hash = createHash("sha256")
      .update(JSON.stringify({ actor: a.id, command: v }))
      .digest("hex");
    const replay = (
      await query<{
        itineraryId: string;
        revision: number;
        payloadHash: string;
        leadId: string;
      }>(
        `SELECT v."itineraryId",v.revision,v."payloadHash",i."leadId" FROM "WorkspaceItineraryVersion" v JOIN "WorkspaceItinerary" i ON i.id=v."itineraryId" AND i."agencyId"=v."agencyId" ${scopedJoin} WHERE ${scopedWhere} AND v."requestId"=$3`,
        [a.agencyId, a.id, v.requestId],
        tx,
      )
    )[0];
    if (replay) {
      if (replay.payloadHash !== hash)
        throw new HttpError(
          409,
          "This request key was already used for different itinerary values",
        );
      return {
        id: replay.itineraryId,
        revision: replay.revision,
        replayed: true,
      };
    }
    let previous: ItineraryRow | undefined;
    if (v.id) {
      previous = (
        await query<ItineraryRow>(
          `SELECT i.*,u.role AS "__role" FROM "WorkspaceItinerary" i ${scopedJoin} WHERE ${scopedWhere} AND i.id=$3${tx ? " FOR UPDATE OF i" : ""}`,
          [a.agencyId, a.id, v.id],
          tx,
        )
      )[0];
      if (!previous || previous.leadId !== v.leadId)
        throw new HttpError(404, "Itinerary not found");
      if (previous.packageId !== v.packageId)
        throw new HttpError(
          409,
          "The source package is fixed for version history. Create a new itinerary to use a different package",
        );
      if (previous.revision !== v.revision)
        throw new HttpError(409, "Itinerary changed. Reload before saving");
      if (a.role === "AGENT" && JSON.parse(previous.payload).costs?.length)
        throw new HttpError(
          403,
          "A manager must edit an itinerary with private supplier costs",
        );
    } else if (v.revision !== 0)
      throw new HttpError(400, "New itinerary revision must be zero");
    const count = (
      await query<{ n: number | bigint }>(
        'SELECT COUNT(*) AS n FROM "WorkspaceItinerary" WHERE "agencyId"=$1',
        [a.agencyId],
        tx,
      )
    )[0];
    if (!previous && Number(count.n) >= MAX_DOCUMENTS)
      throw new HttpError(
        409,
        "Itinerary document limit reached. Contact support for capacity review",
      );
    const revision = previous ? previous.revision + 1 : 0;
    if (revision >= MAX_VERSIONS)
      throw new HttpError(
        409,
        "Itinerary version limit reached. Contact support before creating further versions",
      );
    if (
      v.packageId &&
      !(
        await query<{ id: string }>(
          'SELECT id FROM "Package" WHERE id=$1 AND "agencyId"=$2',
          [v.packageId, a.agencyId],
          tx,
        )
      )[0]
    )
      throw new HttpError(404, "Package not found");
    const id = previous?.id ?? randomUUID(),
      stamp = new Date().toISOString(),
      payload = JSON.stringify(v.payload),
      writes: { sql: string; values: unknown[] }[] = [];
    if (previous)
      writes.push({
        sql: 'UPDATE "WorkspaceItinerary" SET title=$1,"startDate"=$2,"daysCount"=$3,payload=$4,revision=$5,"updatedAt"=$6,"packageId"=$7 WHERE id=$8 AND "agencyId"=$9 AND revision=$10',
        values: [
          v.payload.title,
          v.payload.startDate,
          v.payload.days.length,
          payload,
          revision,
          stamp,
          v.packageId,
          id,
          a.agencyId,
          v.revision,
        ],
      });
    else
      writes.push({
        sql: 'INSERT INTO "WorkspaceItinerary" (id,"agencyId","leadId","packageId",title,"startDate","daysCount",payload,revision,"createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$10)',
        values: [
          id,
          a.agencyId,
          v.leadId,
          v.packageId,
          v.payload.title,
          v.payload.startDate,
          v.payload.days.length,
          payload,
          a.id,
          stamp,
        ],
      });
    writes.push(
      {
        sql: 'INSERT INTO "WorkspaceItineraryVersion" (id,"itineraryId","agencyId",revision,payload,"requestId","payloadHash","actorId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        values: [
          randomUUID(),
          id,
          a.agencyId,
          revision,
          payload,
          v.requestId,
          hash,
          a.id,
          stamp,
        ],
      },
      {
        sql: 'INSERT INTO "Activity" (id,"agencyId","leadId",actor,action,"createdAt") VALUES ($1,$2,$3,$4,$5,$6)',
        values: [
          randomUUID(),
          a.agencyId,
          v.leadId,
          a.id,
          `Itinerary version ${revision + 1} saved`,
          new Date(),
        ],
      },
    );
    if (binding) {
      const guards: D1Statement[] = [
        {
          sql: `SELECT COUNT(*)=1 FROM "User" u JOIN "Agency" g ON g.id=u."agencyId" JOIN "Lead" l ON l."agencyId"=g.id WHERE u.id=? AND u."agencyId"=? AND NOT u.disabled AND u.role=? AND NOT g.demo AND l.id=? AND (u.role<>'AGENT' OR l."assignedId"=u.id) AND ((g.subscription='Trial' AND julianday(g."trialEndsAt")>julianday('now')) OR (g.subscription='Active' AND (g."subscriptionExpiresAt" IS NULL OR julianday(g."subscriptionExpiresAt")>julianday('now'))))`,
          values: [a.id, a.agencyId, a.role, v.leadId],
        },
      ];
      if (v.packageId)
        guards.push({
          sql: 'SELECT COUNT(*)=1 FROM "Package" WHERE id=? AND "agencyId"=?',
          values: [v.packageId, a.agencyId],
        });
      if (previous)
        guards.push({
          sql: 'SELECT COUNT(*)=1 FROM "WorkspaceItinerary" WHERE id=? AND "agencyId"=? AND "leadId"=? AND revision=?',
          values: [id, a.agencyId, v.leadId, v.revision],
        });
      else
        guards.push({
          sql: 'SELECT COUNT(*)<? FROM "WorkspaceItinerary" WHERE "agencyId"=?',
          values: [MAX_DOCUMENTS, a.agencyId],
        });
      const native = (s: { sql: string; values: unknown[] }) => {
        const values: unknown[] = [];
        return {
          sql: s.sql.replace(/\$(\d+)/g, (_all, n) => {
            values.push(encodeD1(s.values[Number(n) - 1]));
            return "?";
          }),
          values: values as D1Statement["values"],
        };
      };
      const { guardedD1Batch } = await import("../d1/atomic");
      await guardedD1Batch(binding, guards, writes.map(native));
    } else
      for (const w of writes) await tx!.$executeRawUnsafe(w.sql, ...w.values);
    return { id, revision, replayed: false };
  }
  return binding
    ? save()
    : db.$transaction(save, { isolationLevel: "Serializable" });
}
