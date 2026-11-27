import { transactionConflict, uniqueConflict } from "../db-conflicts";
import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Actor } from "../access";
import { db, d1Binding } from "../db";
import { HttpError } from "../http";
import { requireSubscription } from "../subscriptions";
import { atomicD1Batch } from "../d1/atomic";
import { encodeD1 } from "../d1/unit";
import { supplierProfileSchema, supplierSaveSchema } from "./format";
const MAX_SUPPLIERS = 200;
type Row = {
  id: string;
  agencyId: string;
  name: string;
  kind: string;
  city: string;
  status: string;
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
    const args: ReturnType<typeof encodeD1>[] = [];
    const native = sql.replace(/\$(\d+)/g, (_, n) => {
      args.push(encodeD1(values[Number(n) - 1]));
      return "?";
    });
    return (
      await binding
        .prepare(native)
        .bind(...args)
        .all<T>()
    ).results;
  }
  return (tx ?? db).$queryRawUnsafe<T[]>(sql, ...values);
}
async function access(a: Actor, write = false, tx?: Prisma.TransactionClient) {
  if (a.demo)
    throw new HttpError(
      403,
      "Supplier directory is not available in the read-only demo",
    );
  if (tx) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${a.id} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "Agency" WHERE id=${a.agencyId} FOR UPDATE`;
  }
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
    !["OWNER", "MANAGER"].includes(user.role)
  )
    throw new HttpError(
      403,
      "Only an active owner or manager can access private supplier contracts",
    );
  if (write) requireSubscription(user.agency);
  return { ...a, role: user.role };
}
const scopeJoin =
  'JOIN "User" u ON u.id=$2 AND u."agencyId"=s."agencyId" AND NOT u.disabled AND u.role IN (\'OWNER\',\'MANAGER\')';
function present(row: Row) {
  return {
    ...row,
    payload: undefined,
    profile: supplierProfileSchema.parse(JSON.parse(row.payload)),
  };
}
export async function supplierOverview(
  actor: Actor,
  options: { id?: string; page?: number; search?: string } = {},
) {
  const a = await access(actor);
  if (options.id) {
    const row = (
      await query<Row>(
        `SELECT s.* FROM "AgencySupplier" s ${scopeJoin} WHERE s."agencyId"=$1 AND s.id=$3`,
        [a.agencyId, a.id, options.id],
      )
    )[0];
    if (!row) throw new HttpError(404, "Supplier not found");
    const versions = await query<{
      revision: number;
      payload: string;
      createdAt: string;
    }>(
      `SELECT v.revision,v.payload,v."createdAt" FROM "AgencySupplierVersion" v JOIN "AgencySupplier" s ON s.id=v."supplierId" AND s."agencyId"=v."agencyId" ${scopeJoin} WHERE s."agencyId"=$1 AND s.id=$3 ORDER BY v.revision DESC LIMIT 30`,
      [a.agencyId, a.id, row.id],
    );
    return {
      supplier: present(row),
      versions: versions.map((v) => ({
        ...v,
        payload: undefined,
        profile: supplierProfileSchema.parse(JSON.parse(v.payload)),
      })),
    };
  }
  const page = options.page ?? 0,
    search = (options.search ?? "").trim().toLowerCase();
  const rows = await query<Omit<Row, "payload">>(
    `SELECT s.id,s.name,s.kind,s.city,s.status,s.revision,s."updatedAt" FROM "AgencySupplier" s ${scopeJoin} WHERE s."agencyId"=$1 AND (LOWER(s.name) LIKE $3 OR LOWER(s.city) LIKE $3) ORDER BY s."updatedAt" DESC,s.id LIMIT 21 OFFSET $4`,
    [a.agencyId, a.id, `%${search}%`, page * 20],
  );
  return {
    suppliers: rows.slice(0, 20),
    hasMore: rows.length > 20,
    page,
    limit: MAX_SUPPLIERS,
  };
}
export async function saveSupplier(actor: Actor, input: unknown) {
  const v = supplierSaveSchema.parse(input);
  if (!v.id && v.revision !== 0)
    throw new HttpError(400, "A new supplier starts at revision zero");
  const payload = JSON.stringify(v.profile);
  if (payload.length > 12000)
    throw new HttpError(400, "Supplier profile exceeds the supported size");
  const hash = createHash("sha256")
    .update(JSON.stringify({ actor: actor.id, command: v }))
    .digest("hex");
  const receipt = async (tx?: Prisma.TransactionClient) => {
    const r = (
      await query<{
        supplierId: string;
        revision: number;
        payloadHash: string;
      }>(
        'SELECT "supplierId",revision,"payloadHash" FROM "AgencySupplierVersion" WHERE "agencyId"=$1 AND "requestId"=$2',
        [actor.agencyId, v.requestId],
        tx,
      )
    )[0];
    if (!r) return null;
    if (r.payloadHash !== hash)
      throw new HttpError(
        409,
        "This request key was already used for different supplier values",
      );
    return { id: r.supplierId, revision: r.revision, replayed: true };
  };
  async function save(tx?: Prisma.TransactionClient) {
    const a = await access(actor, true, tx);
    const replay = await receipt(tx);
    if (replay) return replay;
    const old = v.id
      ? (
          await query<Row>(
            'SELECT * FROM "AgencySupplier" WHERE id=$1 AND "agencyId"=$2',
            [v.id, a.agencyId],
            tx,
          )
        )[0]
      : undefined;
    if (v.id && !old) throw new HttpError(404, "Supplier not found");
    if (old && old.revision !== v.revision)
      throw new HttpError(409, "Supplier changed. Reload before saving");
    const count = Number(
      (
        await query<{ n: number | string }>(
          'SELECT COUNT(*) AS n FROM "AgencySupplier" WHERE "agencyId"=$1',
          [a.agencyId],
          tx,
        )
      )[0].n,
    );
    if (!old && count >= MAX_SUPPLIERS)
      throw new HttpError(
        409,
        "Supplier directory limit reached; review capacity before adding more records",
      );
    const revision = old ? old.revision + 1 : 0;
    if (revision >= 30)
      throw new HttpError(
        409,
        "Supplier history limit reached; contact support before adding further versions",
      );
    const id = old?.id ?? randomUUID(),
      stamp = new Date().toISOString();
    const writes: { sql: string; values: unknown[] }[] = old
      ? [
          {
            sql: 'UPDATE "AgencySupplier" SET name=$1,kind=$2,city=$3,status=$4,payload=$5,revision=$6,"updatedAt"=$7 WHERE id=$8 AND "agencyId"=$9 AND revision=$10',
            values: [
              v.profile.name,
              v.profile.kind,
              v.profile.city,
              v.profile.status,
              payload,
              revision,
              stamp,
              id,
              a.agencyId,
              old.revision,
            ],
          },
        ]
      : [
          {
            sql: 'INSERT INTO "AgencySupplier" (id,"agencyId",name,kind,city,status,payload,revision,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
            values: [
              id,
              a.agencyId,
              v.profile.name,
              v.profile.kind,
              v.profile.city,
              v.profile.status,
              payload,
              revision,
              stamp,
            ],
          },
        ];
    writes.push(
      {
        sql: 'INSERT INTO "AgencySupplierVersion" (id,"supplierId","agencyId",revision,payload,"requestId","payloadHash","actorId","createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
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
        sql: 'INSERT INTO "Activity" (id,"agencyId",actor,action,"createdAt") VALUES($1,$2,$3,$4,$5)',
        values: [
          randomUUID(),
          a.agencyId,
          a.id,
          `Supplier ${old ? "updated" : "created"} · ${id} · revision ${revision}`,
          new Date(stamp),
        ],
      },
    );
    const binding = d1Binding();
    if (binding) {
      const sql = (q: { sql: string; values: unknown[] }) => {
        const values: ReturnType<typeof encodeD1>[] = [];
        return {
          sql: q.sql.replace(/\$(\d+)/g, (_, n) => {
            values.push(encodeD1(q.values[Number(n) - 1]));
            return "?";
          }),
          values,
        };
      };
      const guards = `SELECT EXISTS(SELECT 1 FROM "User" u JOIN "Agency" a ON a.id=u."agencyId" WHERE u.id=$1 AND u."agencyId"=$2 AND NOT u.disabled AND NOT a.demo AND u.role IN ('OWNER','MANAGER') AND ((a.subscription='Trial' AND julianday(a."trialEndsAt")>julianday($3)) OR (a.subscription='Active' AND (a."subscriptionExpiresAt" IS NULL OR julianday(a."subscriptionExpiresAt")>julianday($3))))) AND NOT EXISTS(SELECT 1 FROM "AgencySupplierVersion" WHERE "agencyId"=$2 AND "requestId"=$4) AND (SELECT COUNT(*) FROM "AgencySupplier" WHERE "agencyId"=$2)=$5 AND ${old ? 'EXISTS(SELECT 1 FROM "AgencySupplier" WHERE id=$6 AND "agencyId"=$2 AND revision=$7)' : 'NOT EXISTS(SELECT 1 FROM "AgencySupplier" WHERE id=$6)'}`;
      await atomicD1Batch(
        binding,
        sql({
          sql: guards,
          values: [
            a.id,
            a.agencyId,
            stamp,
            v.requestId,
            count,
            id,
            ...(old ? [old.revision] : []),
          ],
        }),
        writes.map(sql),
      );
    } else
      for (const w of writes) await tx!.$executeRawUnsafe(w.sql, ...w.values);
    return { id, revision, replayed: false };
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return d1Binding()
        ? await save()
        : await db.$transaction((tx) => save(tx), {
            isolationLevel: "Serializable",
          });
    } catch (error) {
      const rollbackConflict =
        transactionConflict(error) ||
        (error instanceof HttpError &&
          error.status === 409 &&
          error.message.startsWith("This record changed"));
      if (
        rollbackConflict ||
        uniqueConflict(error) ||
        (error instanceof HttpError && error.status === 409)
      ) {
        await access(actor);
        const replay = await receipt();
        if (replay) return replay;
        if (rollbackConflict && attempt < 2) continue;
        if (rollbackConflict || uniqueConflict(error))
          throw new HttpError(
            409,
            "Supplier changed during another update. Reload before saving.",
          );
      }
      throw error;
    }
  }
}
