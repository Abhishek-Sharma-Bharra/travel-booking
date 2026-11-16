import type { D1Database } from "@cloudflare/workers-types";
import type { Agency, User, AutomationJob } from "@prisma/client";
import type { Actor } from "../access";
import { requireOwner } from "../access";
import { requireSubscription } from "../subscriptions";
import { HttpError } from "../http";
import {
  D1Unit,
  newD1Record,
  insertD1,
  updateD1,
  encodeD1,
  d1Record,
} from "./unit";
import { randomUUID } from "node:crypto";
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await fn();
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof HttpError &&
        error.status === 409 &&
        error.message.startsWith("This record changed")
      )
        continue;
      throw error;
    }
}
async function ownerUnit(
  binding: D1Database,
  actor: Actor,
  allowInactive = false,
) {
  const unit = new D1Unit(binding),
    user = (await unit.read<User>("User", '"id"=?', [actor.id]))[0];
  if (actor.demo || !user || user.disabled || user.agencyId !== actor.agencyId)
    throw new HttpError(403, "Workspace access unavailable");
  requireOwner({ ...actor, role: user.role });
  const agency = (
    await unit.read<Agency>("Agency", '"id"=?', [actor.agencyId])
  )[0];
  if (!agency || agency.demo)
    throw new HttpError(403, "Demo configuration is read-only");
  if (!allowInactive) requireSubscription(agency);
  return unit;
}
export async function saveConsentD1(
  binding: D1Database,
  actor: Actor,
  phone: string,
  optedIn: boolean,
  evidence: string,
) {
  return retry(async () => {
    const unit = await ownerUnit(binding, actor, true),
      now = new Date();
    const consent = insertD1(
      "MessagingConsent",
      newD1Record("MessagingConsent", {
        agencyId: actor.agencyId,
        phone,
        optedIn,
        updatedAt: now,
      }),
    );
    unit.writes.push(
      {
        ...consent,
        sql:
          consent.sql +
          ' ON CONFLICT ("agencyId",phone) DO UPDATE SET "optedIn"=excluded."optedIn","updatedAt"=excluded."updatedAt"',
      },
      insertD1(
        "MessagingConsentEvent",
        newD1Record("MessagingConsentEvent", {
          id: randomUUID(),
          agencyId: actor.agencyId,
          phone,
          optedIn,
          evidence,
          actor: actor.id,
          occurredAt: now,
        }),
      ),
    );
    await unit.commit();
    return { message: "Consent evidence recorded. No message sent." };
  });
}
export async function saveAutomationD1(
  binding: D1Database,
  actor: Actor,
  settings: {
    enabled: boolean;
    ads: boolean;
    reminders: boolean;
    notifications: boolean;
    summaries: boolean;
    alerts: boolean;
  },
) {
  return retry(async () => {
    const unit = await ownerUnit(binding, actor, !settings.enabled);
    const policy = insertD1(
      "AutomationPolicy",
      newD1Record("AutomationPolicy", {
        agencyId: actor.agencyId,
        ...settings,
      }),
    );
    unit.writes.push(
      {
        ...policy,
        sql:
          policy.sql +
          ' ON CONFLICT ("agencyId") DO UPDATE SET enabled=excluded.enabled,ads=excluded.ads,reminders=excluded.reminders,notifications=excluded.notifications,summaries=excluded.summaries,alerts=excluded.alerts,revision="AutomationPolicy".revision+1,"updatedAt"=excluded."updatedAt"',
      },
      {
        sql: `UPDATE "AutomationJob" SET status='CANCELLED',"errorCode"='POLICY_CHANGED',"leaseToken"='',"leaseUntil"=NULL,"updatedAt"=? WHERE "agencyId"=? AND status IN ('QUEUED','RUNNING','BLOCKED')`,
        values: [encodeD1(new Date()), actor.agencyId],
      },
      insertD1(
        "Activity",
        newD1Record("Activity", {
          agencyId: actor.agencyId,
          actor: actor.id,
          action: "Automation policy changed; pending jobs cancelled",
        }),
      ),
    );
    await unit.commit();
    return {
      message:
        "Automation policy saved. Real messaging still requires separate global approval.",
    };
  });
}
export async function enqueueJobD1(
  binding: D1Database,
  data: {
    agencyId: string;
    kind: string;
    key: string;
    payload: unknown;
    policyRevision: number;
  },
): Promise<AutomationJob> {
  const record = insertD1("AutomationJob", newD1Record("AutomationJob", data));
  const row = await binding
    .prepare(
      record.sql +
        ' ON CONFLICT ("agencyId","key") DO UPDATE SET "key"=excluded."key" RETURNING *',
    )
    .bind(...(record.values ?? []))
    .first<Record<string, unknown>>();
  if (!row) throw new HttpError(503, "Job could not be queued");
  return d1Record<AutomationJob>("AutomationJob", row);
}
export async function claimJobD1(
  binding: D1Database,
  now: Date,
): Promise<AutomationJob | null> {
  const token = randomUUID(),
    time = encodeD1(now),
    until = encodeD1(new Date(+now + 180000));
  try {
    const result = await binding.batch<Record<string, unknown>>([
      binding
        .prepare(
          `UPDATE "AutomationJob" SET status='RUNNING',"leaseToken"=?,"leaseUntil"=?,attempts=attempts+1,"updatedAt"=? WHERE id=(SELECT id FROM "AutomationJob" WHERE (status='QUEUED' AND julianday("availableAt")<=julianday(?)) OR (status='RUNNING' AND julianday("leaseUntil")<=julianday(?)) ORDER BY "availableAt",id LIMIT 1) RETURNING *`,
        )
        .bind(token, until, time, time, time),
      binding
        .prepare(
          `INSERT INTO "AutomationAttempt" (id,"agencyId","jobId",attempt,status,"errorCode","createdAt") SELECT ?,"agencyId",id,attempts,'STARTED','',? FROM "AutomationJob" WHERE "leaseToken"=? AND status='RUNNING'`,
        )
        .bind(randomUUID(), time, token),
    ]);
    const row = result[0].results[0];
    return row ? d1Record<AutomationJob>("AutomationJob", row) : null;
  } catch {
    throw new HttpError(
      503,
      "Job reservation could not be completed. Please retry.",
    );
  }
}
export async function finishJobD1(
  binding: D1Database,
  job: AutomationJob,
  status: string,
  errorCode: string,
  result: unknown,
  delay: number,
  failed: boolean,
) {
  return retry(async () => {
    const unit = new D1Unit(binding),
      current = (
        await unit.read<AutomationJob>(
          "AutomationJob",
          '"id"=? AND "agencyId"=?',
          [job.id, job.agencyId],
        )
      )[0];
    if (
      !current ||
      current.status !== "RUNNING" ||
      current.leaseToken !== job.leaseToken
    )
      return;
    unit.writes.push(
      updateD1("AutomationJob", job.id, {
        status,
        errorCode,
        ...(result ? { result } : {}),
        availableAt: new Date(Date.now() + delay),
        leaseToken: "",
        leaseUntil: null,
        ...(failed ? { failures: current.failures + 1 } : {}),
      }),
      insertD1(
        "AutomationAttempt",
        newD1Record("AutomationAttempt", {
          agencyId: current.agencyId,
          jobId: current.id,
          attempt: current.attempts,
          status,
          errorCode,
        }),
      ),
    );
    await unit.commit();
  });
}
