import { randomUUID } from "node:crypto";
import type {
  Agency,
  User,
  IntegrationConnection,
  IntegrationSyncRun,
} from "@prisma/client";
import { d1Binding } from "../db";
import {
  D1Unit,
  insertD1,
  updateD1,
  newD1Record,
  bulkInsertD1,
} from "../d1/unit";
import { HttpError } from "../http";
import type { Actor } from "../access";
import { requireSubscription } from "../subscriptions";
import { seal, credentialContext } from "./vault";
import type { Credential, AdAccount, AdFact } from "./meta";

async function scopedUnit(agencyId: string, actor?: Actor, inactive = false) {
  const binding = d1Binding();
  if (!binding) throw Error("D1 integration context required");
  const unit = new D1Unit(binding);
  const agency = (await unit.read<Agency>("Agency", '"id"=?', [agencyId]))[0];
  if (!agency || agency.demo)
    throw new HttpError(403, "Integration access unavailable");
  if (!inactive) requireSubscription(agency);
  if (actor) {
    const user = (
      await unit.read<User>("User", '"id"=? AND "agencyId"=?', [
        actor.id,
        agencyId,
      ])
    )[0];
    if (!user || user.disabled || user.role !== "OWNER" || actor.demo)
      throw new HttpError(403, "Only the agency owner can manage integrations");
  }
  return unit;
}
function audit(unit: D1Unit, actor: Actor, action: string) {
  unit.writes.push(
    insertD1(
      "Activity",
      newD1Record("Activity", {
        agencyId: actor.agencyId,
        actor: actor.id,
        action,
      }),
    ),
  );
}
async function current(unit: D1Unit, c: IntegrationConnection) {
  const fresh = (
    await unit.read<IntegrationConnection>(
      "IntegrationConnection",
      '"id"=? AND "agencyId"=?',
      [c.id, c.agencyId],
    )
  )[0];
  if (
    !fresh ||
    fresh.revision !== c.revision ||
    fresh.status !== c.status ||
    fresh.status === "DISCONNECTED"
  )
    throw new HttpError(
      409,
      "Connection changed. Refresh and authorize again.",
    );
  return fresh;
}
export async function d1SaveAuthorization(
  a: Actor,
  provider: string,
  token: Credential,
) {
  const unit = await scopedUnit(a.agencyId, a);
  const old = (
    await unit.read<IntegrationConnection>(
      "IntegrationConnection",
      '"agencyId"=? AND "provider"=? AND "accountId"=?',
      [a.agencyId, provider, ""],
    )
  )[0];
  const id = old?.id || randomUUID();
  const data = {
    credentials: seal(token, credentialContext(a.agencyId, provider, id)),
    expiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
    status: "SELECT_ACCOUNT",
    errorCode: "",
    revision: (old?.revision || 0) + 1,
  };
  unit.writes.push(
    old
      ? updateD1("IntegrationConnection", id, data)
      : insertD1(
          "IntegrationConnection",
          newD1Record("IntegrationConnection", {
            id,
            agencyId: a.agencyId,
            provider,
            ...data,
          }),
        ),
  );
  audit(
    unit,
    a,
    `${provider} authorization granted; account selection required`,
  );
  await unit.commit();
}
export async function d1SelectAccount(
  a: Actor,
  c: IntegrationConnection,
  selected: AdAccount,
  token: Credential,
) {
  const unit = await scopedUnit(a.agencyId, a);
  await current(unit, c);
  if (c.status !== "SELECT_ACCOUNT")
    throw new HttpError(409, "Account selection is not pending");
  const old = (
    await unit.read<IntegrationConnection>(
      "IntegrationConnection",
      '"agencyId"=? AND "provider"=? AND "accountId"=?',
      [a.agencyId, c.provider, selected.id],
    )
  )[0];
  const id = old?.id || randomUUID();
  const data = {
    accountName: selected.name,
    currency: selected.currency,
    timezone: selected.timezone,
    status: "CONNECTED",
    credentials: seal(
      { ...token, loginCustomerId: selected.loginCustomerId },
      credentialContext(a.agencyId, c.provider, id),
    ),
    expiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
    errorCode: "",
    revision: (old?.revision || 0) + 1,
  };
  unit.writes.push(
    old
      ? updateD1("IntegrationConnection", id, data)
      : insertD1(
          "IntegrationConnection",
          newD1Record("IntegrationConnection", {
            id,
            agencyId: a.agencyId,
            provider: c.provider,
            accountId: selected.id,
            ...data,
          }),
        ),
  );
  unit.writes.push(
    updateD1("IntegrationConnection", c.id, {
      status: "DISCONNECTED",
      credentials: "",
      revision: c.revision + 1,
    }),
  );
  audit(unit, a, `${c.provider} account connected: ${selected.id}`);
  await unit.commit();
  return {
    message: "Advertising account connected. No campaigns were changed.",
  };
}
export async function d1Disconnect(a: Actor, id: string) {
  const unit = await scopedUnit(a.agencyId, a, true);
  const c = (
    await unit.read<IntegrationConnection>(
      "IntegrationConnection",
      '"id"=? AND "agencyId"=?',
      [id, a.agencyId],
    )
  )[0];
  if (!c) throw new HttpError(404, "Connection unavailable");
  unit.writes.push(
    updateD1("IntegrationConnection", id, {
      status: "DISCONNECTED",
      credentials: "",
      revision: c.revision + 1,
      errorCode: "",
    }),
  );
  unit.writes.push({
    sql: "UPDATE \"IntegrationSyncRun\" SET status='FAILED',\"errorCode\"='DISCONNECTED',staged='[]' WHERE \"connectionId\"=? AND \"agencyId\"=? AND status='RUNNING'",
    values: [id, a.agencyId],
  });
  audit(
    unit,
    a,
    `${c.provider} disconnected locally; revoke provider access in account settings too`,
  );
  await unit.commit();
  return {
    message:
      "Connection disabled and credentials removed. Revoke provider access in account settings too.",
  };
}
export async function d1StartSync(
  c: IntegrationConnection,
  from: string,
  to: string,
  leaseToken: string,
): Promise<IntegrationSyncRun> {
  const unit = await scopedUnit(c.agencyId);
  await current(unit, c);
  const runs = await unit.read<IntegrationSyncRun>(
    "IntegrationSyncRun",
    '"connectionId"=? AND "agencyId"=? AND "status"=?',
    [c.id, c.agencyId, "RUNNING"],
  );
  const now = Date.now();
  if (runs.some((r) => +r.leaseUntil > now))
    throw new HttpError(409, "Sync already running");
  const resume = runs
    .filter(
      (r) =>
        r.fromDate === from && r.toDate === to && r.revision === c.revision,
    )
    .sort((a, b) => +b.createdAt - +a.createdAt)[0];
  // Discard abandoned windows; only a single window may have an active lease.
  for (const run of runs)
    if (run.id !== resume?.id)
      unit.writes.push(
        updateD1("IntegrationSyncRun", run.id, {
          status: "FAILED",
          errorCode: "SUPERSEDED",
          staged: [],
        }),
      );
  const data = { leaseToken, leaseUntil: new Date(now + 45000) };
  const run = resume
    ? { ...resume, ...data }
    : (newD1Record("IntegrationSyncRun", {
        agencyId: c.agencyId,
        connectionId: c.id,
        fromDate: from,
        toDate: to,
        revision: c.revision,
        ...data,
      }) as unknown as IntegrationSyncRun);
  unit.writes.push(
    resume
      ? updateD1("IntegrationSyncRun", run.id, data)
      : insertD1(
          "IntegrationSyncRun",
          run as unknown as Record<string, unknown>,
        ),
  );
  await unit.commit();
  return run;
}
export async function d1Checkpoint(
  c: IntegrationConnection,
  run: IntegrationSyncRun,
  leaseToken: string,
  facts: AdFact[],
  cursor: string,
) {
  const unit = await scopedUnit(c.agencyId);
  await current(unit, c);
  const fresh = (
    await unit.read<IntegrationSyncRun>(
      "IntegrationSyncRun",
      '"id"=? AND "agencyId"=?',
      [run.id, c.agencyId],
    )
  )[0];
  if (
    !fresh ||
    fresh.status !== "RUNNING" ||
    fresh.leaseToken !== leaseToken ||
    +fresh.leaseUntil <= Date.now()
  )
    throw new HttpError(409, "Sync lease changed. Start again.");
  if (facts.length > 500)
    throw new HttpError(
      400,
      "Use a narrower date range: D1 advertising sync is limited to 500 daily rows per window.",
    );
  unit.writes.push(
    updateD1("IntegrationSyncRun", run.id, {
      staged: cursor ? facts : [],
      cursor,
      leaseUntil: new Date(Date.now() + 45000),
      ...(!cursor ? { status: "COMPLETE", completedAt: new Date() } : {}),
    }),
  );
  if (!cursor) {
    unit.writes.push({
      sql: 'DELETE FROM "AdDailyMetric" WHERE "agencyId"=? AND "connectionId"=? AND day>=? AND day<=?',
      values: [c.agencyId, c.id, run.fromDate, run.toDate],
    });
    if (facts.length)
      unit.writes.push(
        bulkInsertD1(
          "AdDailyMetric",
          facts.map((f) =>
            newD1Record("AdDailyMetric", {
              ...f,
              id: randomUUID(),
              agencyId: c.agencyId,
              connectionId: c.id,
              currency: c.currency,
              timezone: c.timezone,
              spendMicros: BigInt(f.spendMicros),
              impressions: BigInt(f.impressions),
              clicks: BigInt(f.clicks),
            }),
          ),
        ),
      );
    unit.writes.push(
      updateD1("IntegrationConnection", c.id, {
        lastSyncedAt: new Date(),
        errorCode: "",
      }),
    );
  }
  await unit.commit();
}
