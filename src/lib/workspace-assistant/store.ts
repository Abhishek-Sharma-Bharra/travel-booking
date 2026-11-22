import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db, d1Binding } from "../db";
import type { Actor } from "../access";
import { HttpError } from "../http";
import { requireSubscription } from "../subscriptions";
import { guardedD1Batch } from "../d1/atomic";
import { encodeD1 } from "../d1/unit";
import type { AssistantInput } from "./contracts";
export async function query<T>(
  sql: string,
  values: unknown[],
  tx?: Prisma.TransactionClient,
): Promise<T[]> {
  const d1 = d1Binding();
  if (d1) {
    const bound: unknown[] = [];
    sql = sql.replace(/\$(\d+)/g, (_, n) => {
      bound.push(encodeD1(values[Number(n) - 1]));
      return "?";
    });
    return (
      await d1
        .prepare(sql)
        .bind(...bound)
        .all<T>()
    ).results;
  }
  return (tx ?? db).$queryRawUnsafe<T[]>(sql, ...values);
}
export async function assistantActor(a: Actor, tx?: Prisma.TransactionClient) {
  const u = await (tx ?? db).user.findUnique({
    where: { id: a.id },
    include: { agency: true },
  });
  if (
    !u ||
    u.disabled ||
    u.agencyId !== a.agencyId ||
    !u.agency ||
    u.agency.demo ||
    a.demo ||
    !["OWNER", "MANAGER", "AGENT"].includes(u.role)
  )
    throw new HttpError(403, "Assistant workspace access unavailable");
  requireSubscription(u.agency);
  return { ...a, role: u.role };
}
const dayStart = () => new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
const hourStart = () => new Date(Date.now() - 3600000).toISOString();
export const assistantLimits = {
  guidedDaily: 100,
  liveDaily: 50,
  liveHourlyPerUser: 10,
  dailyTokens: 100000,
  reservePerCall: 10000,
};
const tokenSql =
  'CASE WHEN "inputTokens" IS NULL OR "outputTokens" IS NULL THEN "reservedTokens" ELSE "inputTokens"+"outputTokens" END';
export async function reserveAssistant(a: Actor, v: AssistantInput) {
  const hash = createHash("sha256").update(JSON.stringify(v)).digest("hex"),
    id = randomUUID(),
    stamp = new Date().toISOString();
  async function run(tx?: Prisma.TransactionClient) {
    if (tx)
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${a.id} FOR SHARE`;
    const current = await assistantActor(a, tx);
    const prior = (
      await query<{ payloadHash: string; state: string }>(
        'SELECT "payloadHash",state FROM "WorkspaceAssistantUsage" WHERE "agencyId"=$1 AND "requestId"=$2',
        [a.agencyId, v.requestId],
        tx,
      )
    )[0];
    if (prior)
      throw new HttpError(
        409,
        prior.payloadHash === hash
          ? "This assistant request was already received. Review its result or usage before starting a new request."
          : "Request key already used for different assistant values",
      );
    const daily = (
      await query<{ calls: number; tokens: number }>(
        `SELECT COUNT(*) AS calls,COALESCE(SUM(${tokenSql}),0) AS tokens FROM "WorkspaceAssistantUsage" WHERE "agencyId"=$1 AND mode=$2 AND "createdAt">=$3`,
        [a.agencyId, v.mode, dayStart()],
        tx,
      )
    )[0];
    const hourly = (
      await query<{ calls: number }>(
        'SELECT COUNT(*) AS calls FROM "WorkspaceAssistantUsage" WHERE "actorId"=$1 AND mode=\'LIVE\' AND "createdAt">=$2',
        [a.id, hourStart()],
        tx,
      )
    )[0];
    if (
      Number(daily.calls) >= (v.mode === "LIVE" ? 50 : 100) ||
      (v.mode === "LIVE" &&
        (Number(daily.tokens) + 10000 > 100000 || Number(hourly.calls) >= 10))
    )
      throw new HttpError(
        429,
        "Assistant usage limit reached. Use existing manual workflows or wait for the next usage window.",
      );
    const sql =
        'INSERT INTO "WorkspaceAssistantUsage" (id,"agencyId","actorId","requestId","payloadHash",mode,state,tool,model,"reservedTokens","createdAt") VALUES ($1,$2,$3,$4,$5,$6,\'RESERVED\',$7,$8,$9,$10)',
      values = [
        id,
        a.agencyId,
        a.id,
        v.requestId,
        hash,
        v.mode,
        v.tool,
        v.mode === "LIVE"
          ? process.env.AI_MODEL || "gpt-4.1-mini"
          : "guided-v1",
        v.mode === "LIVE" ? 10000 : 0,
        stamp,
      ];
    if (d1Binding()) {
      const bound: unknown[] = [];
      const native = sql.replace(/\$(\d+)/g, (_, n) => {
        bound.push(values[Number(n) - 1]);
        return "?";
      });
      const conditions = [
        {
          sql: 'SELECT COUNT(*)=1 FROM "User" u JOIN "Agency" a ON a.id=u."agencyId" WHERE u.id=? AND u."agencyId"=? AND u.disabled=0 AND u.role=? AND a.demo=0 AND ((a.subscription=\'Trial\' AND julianday(a."trialEndsAt")>julianday(\'now\')) OR (a.subscription=\'Active\' AND (a."subscriptionExpiresAt" IS NULL OR julianday(a."subscriptionExpiresAt")>julianday(\'now\'))))',
          values: [a.id, a.agencyId, current.role],
        },
        {
          sql: 'SELECT COUNT(*)<? FROM "WorkspaceAssistantUsage" WHERE "agencyId"=? AND mode=? AND "createdAt">=?',
          values: [
            v.mode === "LIVE" ? 50 : 100,
            a.agencyId,
            v.mode,
            dayStart(),
          ],
        },
      ];
      if (v.mode === "LIVE")
        conditions.push(
          {
            sql: `SELECT COALESCE(SUM(${tokenSql}),0)+10000<=100000 FROM "WorkspaceAssistantUsage" WHERE "agencyId"=? AND mode='LIVE' AND "createdAt">=?`,
            values: [a.agencyId, dayStart()],
          },
          {
            sql: 'SELECT COUNT(*)<10 FROM "WorkspaceAssistantUsage" WHERE "actorId"=? AND mode=\'LIVE\' AND "createdAt">=?',
            values: [a.id, hourStart()],
          },
        );
      await guardedD1Batch(d1Binding()!, conditions, [
        { sql: native, values: bound as (string | number)[] },
      ]);
    } else await tx!.$executeRawUnsafe(sql, ...values);
    return id;
  }
  return d1Binding()
    ? run()
    : db.$transaction(run, { isolationLevel: "Serializable" });
}
export async function finishAssistant(
  a: Actor,
  id: string,
  tool: string,
  state: "SUCCEEDED" | "FAILED",
  usage?: { input: number; output: number },
  code = "",
) {
  await query(
    'UPDATE "WorkspaceAssistantUsage" SET state=$1,tool=$2,"inputTokens"=$3,"outputTokens"=$4,"finishedAt"=$5,"failureCode"=$6 WHERE id=$7 AND "agencyId"=$8 AND "actorId"=$9 AND state=\'RESERVED\' RETURNING id',
    [
      state,
      tool,
      usage?.input ?? null,
      usage?.output ?? null,
      new Date().toISOString(),
      code,
      id,
      a.agencyId,
      a.id,
    ],
  );
}
export async function assistantUsage(actor: Actor) {
  const a = await assistantActor(actor);
  const rows = await query<{
    mode: string;
    state: string;
    calls: number;
    tokens: number;
  }>(
    `SELECT mode,state,COUNT(*) AS calls,COALESCE(SUM(${tokenSql}),0) AS tokens FROM "WorkspaceAssistantUsage" WHERE "agencyId"=$1 AND "createdAt">=$2 ${a.role === "AGENT" ? 'AND "actorId"=$3' : ""} GROUP BY mode,state`,
    a.role === "AGENT"
      ? [a.agencyId, dayStart(), a.id]
      : [a.agencyId, dayStart()],
  );
  return {
    window: "UTC day",
    scope:
      a.role === "AGENT"
        ? "Your assistant requests"
        : "Agency assistant requests",
    rows: rows.map((r) => ({
      ...r,
      calls: Number(r.calls),
      tokens: Number(r.tokens),
    })),
    limits: assistantLimits,
    costNote:
      "Tokens are provider-reported or conservatively reserved while usage is unconfirmed. This journal covers workspace assistant calls only. Currency charges require reconciliation with the provider; no price is assumed.",
  };
}
