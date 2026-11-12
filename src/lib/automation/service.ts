import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma, AutomationJob } from "@prisma/client";
import { db } from "../db";
import type { Actor } from "../access";
import { integrationActor, syncAds } from "../integrations/service";
import {
  dispatchNotification,
  queueNotification,
  liveMessagingApproved,
} from "../messaging/service";
import { calendarDate, shiftDay } from "../reporting-time";
import { subscriptionAccess } from "../subscriptions";
import { HttpError } from "../http";
import { ProviderError } from "../integrations/provider-http";
import { kpiData } from "../kpi-service";
export function authorizeRunner(header: string | null) {
  const secret = process.env.AUTOMATION_RUNNER_SECRET || "";
  const actual = Buffer.from(header || ""),
    expected = Buffer.from("Bearer " + secret);
  if (
    secret.length < 32 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw new HttpError(401, "Invalid runner authorization");
}
const settings = z.object({
  enabled: z.boolean(),
  ads: z.boolean(),
  reminders: z.boolean(),
  notifications: z.boolean(),
  summaries: z.boolean(),
  alerts: z.boolean(),
});
export async function automationOverview(input: Actor) {
  const a = await integrationActor(input);
  return {
    policy: await db.automationPolicy.findUnique({
      where: { agencyId: a.agencyId },
    }),
    owner: a.role === "OWNER",
    liveMessagingApproved: liveMessagingApproved(),
    jobs: await db.automationJob.findMany({
      where: { agencyId: a.agencyId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        status: true,
        attempts: true,
        failures: true,
        errorCode: true,
        availableAt: true,
        createdAt: true,
        result: true,
      },
    }),
    logs: await db.automationAttempt.findMany({
      where: { agencyId: a.agencyId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  };
}
export async function saveAutomation(input: Actor, value: unknown) {
  const v = settings.parse(value),
    a = await integrationActor(input, true, !v.enabled);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Agency" WHERE id=${a.agencyId} FOR UPDATE`;
    await tx.automationPolicy.upsert({
      where: { agencyId: a.agencyId },
      create: { agencyId: a.agencyId, ...v },
      update: { ...v, revision: { increment: 1 } },
    });
    await tx.automationJob.updateMany({
      where: {
        agencyId: a.agencyId,
        status: { in: ["QUEUED", "RUNNING", "BLOCKED"] },
      },
      data: {
        status: "CANCELLED",
        errorCode: "POLICY_CHANGED",
        leaseToken: "",
        leaseUntil: null,
      },
    });
    await tx.activity.create({
      data: {
        agencyId: a.agencyId,
        actor: a.id,
        action: "Automation policy changed; pending jobs cancelled",
      },
    });
  });
  return {
    message:
      "Automation policy saved. Real messaging still requires separate global approval.",
  };
}
export async function enqueueJob(
  agencyId: string,
  kind: string,
  key: string,
  payload: Prisma.InputJsonValue,
  revision: number,
) {
  return db.automationJob.upsert({
    where: { agencyId_key: { agencyId, key } },
    create: { agencyId, kind, key, payload, policyRevision: revision },
    update: {},
  });
}
export async function scheduleManualNotification(
  input: Actor,
  bookingId: string,
  kind: string,
) {
  const a = await integrationActor(input, true),
    p = await db.automationPolicy.findUnique({
      where: { agencyId: a.agencyId },
    });
  if (!p?.enabled)
    throw new HttpError(
      409,
      "Enable the approved agency messaging workflow before queueing",
    );
  const reminders = ["PAYMENT_REMINDER", "DEPARTURE_REMINDER"].includes(kind);
  if (reminders ? !p.reminders : !p.notifications)
    throw new HttpError(409, "This agency messaging workflow is disabled");
  const agency = await db.agency.findUniqueOrThrow({
      where: { id: a.agencyId },
    }),
    day = calendarDate(new Date(), agency.timezone);
  const n = await queueNotification(a.agencyId, bookingId, kind);
  await enqueueJob(
    a.agencyId,
    "WHATSAPP_SEND",
    "whatsapp:" + n.id,
    { notificationId: n.id, day },
    p.revision,
  );
  return n;
}
export async function scheduleAutomation(cursor = "", now = new Date()) {
  const policies = await db.automationPolicy.findMany({
    where: { enabled: true, agencyId: { gt: cursor } },
    orderBy: { agencyId: "asc" },
    take: 21,
    include: { agency: true },
  });
  for (const p of policies.slice(0, 20)) {
    if (p.agency.demo || !subscriptionAccess(p.agency, now)) continue;
    const day = calendarDate(now, p.agency.timezone),
      revision = p.revision;
    // Agency-owned clock, no mixed UTC reporting windows. Messages are planned during local business hours only.
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: p.agency.timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(now),
    );
    const add = (kind: string, payload: Prisma.InputJsonValue) =>
      enqueueJob(
        p.agencyId,
        kind,
        `${revision}:${day}:${kind}`,
        payload,
        revision,
      );
    if (p.ads) await add("PLAN_ADS", { day, cursor: "" });
    if ((p.reminders || p.notifications) && hour >= 9 && hour < 18)
      await add("PLAN_MESSAGES", { day, cursor: "" });
    if (p.summaries) await add("DAILY_SUMMARY", { day: shiftDay(day, -1) });
    if (p.alerts) await add("INTEGRATION_ALERT", { day });
  }
  return {
    nextCursor: policies.length > 20 ? policies[19].agencyId : null,
    agencies: Math.min(policies.length, 20),
  };
}
export async function claimJob(now = new Date()) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "AutomationJob" WHERE (status='QUEUED' AND "availableAt"<=${now}) OR (status='RUNNING' AND "leaseUntil"<=${now}) ORDER BY "availableAt",id FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    const j = await tx.automationJob.update({
      where: { id: rows[0].id },
      data: {
        status: "RUNNING",
        leaseToken: randomUUID(),
        leaseUntil: new Date(+now + 180000),
        attempts: { increment: 1 },
      },
    });
    await tx.automationAttempt.create({
      data: {
        agencyId: j.agencyId,
        jobId: j.id,
        attempt: j.attempts,
        status: "STARTED",
      },
    });
    return j;
  });
}
class Blocked extends Error {}
class Checkpoint extends Error {}
async function perform(j: AutomationJob, transport: typeof fetch) {
  const agency = await db.agency.findUniqueOrThrow({
      where: { id: j.agencyId },
    }),
    p = await db.automationPolicy.findUnique({
      where: { agencyId: j.agencyId },
    });
  if (
    !p?.enabled ||
    p.revision !== j.policyRevision ||
    agency.demo ||
    !subscriptionAccess(agency)
  )
    throw new Blocked("POLICY_OR_SUBSCRIPTION_INACTIVE");
  const daySchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !isNaN(+new Date(v)) && new Date(v).toISOString().slice(0, 10) === v,
    );
  const idSchema = z.string().min(1).max(200);
  const payloadSchema =
    j.kind === "ADS_SYNC"
      ? z.object({ day: daySchema, connectionId: idSchema })
      : j.kind === "WHATSAPP_SEND"
        ? z.object({ day: daySchema, notificationId: idSchema })
        : ["PLAN_ADS", "PLAN_MESSAGES"].includes(j.kind)
          ? z.object({ day: daySchema, cursor: z.string().max(200) })
          : z.object({ day: daySchema });
  const parsed = payloadSchema.safeParse(j.payload);
  if (!parsed.success) throw new Blocked("INVALID_JOB_PAYLOAD");
  const payload = parsed.data as {
    day: string;
    cursor?: string;
    connectionId?: string;
    notificationId?: string;
  };
  const child = (kind: string, key: string, data: Prisma.InputJsonValue) =>
    enqueueJob(j.agencyId, kind, `${j.key}:${key}`, data, p.revision);
  if (j.kind === "PLAN_ADS") {
    if (!p.ads) throw new Blocked("ADS_DISABLED");
    const rows = await db.integrationConnection.findMany({
      where: {
        agencyId: j.agencyId,
        status: "CONNECTED",
        id: { gt: payload.cursor || "" },
      },
      orderBy: { id: "asc" },
      take: 101,
    });
    for (const c of rows.slice(0, 100))
      await child("ADS_SYNC", c.id, {
        connectionId: c.id,
        day: shiftDay(calendarDate(new Date(), c.timezone), -1),
      });
    if (rows.length > 100)
      await child("PLAN_ADS", rows[99].id, {
        day: payload.day!,
        cursor: rows[99].id,
      });
    return { planned: Math.min(rows.length, 100) };
  }
  if (j.kind === "ADS_SYNC") {
    if (!p.ads) throw new Blocked("ADS_DISABLED");
    const id = payload.connectionId!,
      day = payload.day!;
    await syncAds(j.agencyId, id, day, day, transport);
    if (
      await db.integrationSyncRun.count({
        where: {
          agencyId: j.agencyId,
          connectionId: id,
          fromDate: day,
          toDate: day,
          status: "RUNNING",
        },
      })
    )
      throw new Checkpoint("SYNC_CHECKPOINT");
    return { message: "Complete advertising window synchronized" };
  }
  if (j.kind === "PLAN_MESSAGES") {
    if (!liveMessagingApproved())
      throw new Blocked("LIVE_MESSAGING_NOT_AUTHORIZED");
    const day = payload.day!;
    // Stale planners must not create past-due reminders after an outage.
    if (calendarDate(new Date(), agency.timezone) !== day)
      throw new Blocked("MESSAGE_WINDOW_EXPIRED");
    const rows = await db.booking.findMany({
      where: {
        agencyId: j.agencyId,
        status: { not: "Cancelled" },
        id: { gt: payload.cursor || "" },
      },
      orderBy: { id: "asc" },
      take: 101,
    });
    let planned = 0,
      skipped = 0;
    for (const b of rows.slice(0, 100)) {
      const kinds: string[] = [];
      if (
        p.notifications &&
        calendarDate(b.createdAt, agency.timezone) >= shiftDay(day, -2)
      )
        kinds.push("BOOKING_CONFIRMATION");
      if (p.reminders && b.dueDate.toISOString().slice(0, 10) <= day)
        kinds.push("PAYMENT_REMINDER");
      if (
        p.reminders &&
        b.travelStart.toISOString().slice(0, 10) === shiftDay(day, 1)
      )
        kinds.push("DEPARTURE_REMINDER");
      for (const kind of kinds)
        try {
          const n = await queueNotification(j.agencyId, b.id, kind);
          await enqueueJob(
            j.agencyId,
            "WHATSAPP_SEND",
            "whatsapp:" + n.id,
            { notificationId: n.id, day },
            p.revision,
          );
          planned++;
        } catch (e) {
          if (e instanceof HttpError && [400, 409, 429].includes(e.status))
            skipped++;
          else throw e;
        }
    }
    if (rows.length > 100)
      await child("PLAN_MESSAGES", rows[99].id, { day, cursor: rows[99].id });
    return {
      planned,
      skipped,
      message:
        "Skipped recipients lack consent/configuration/balance or exceed frequency limits.",
    };
  }
  if (j.kind === "WHATSAPP_SEND") {
    if (!p.reminders && !p.notifications)
      throw new Blocked("MESSAGING_DISABLED");
    if (!liveMessagingApproved())
      throw new Blocked("LIVE_MESSAGING_NOT_AUTHORIZED");
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: agency.timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
    if (
      payload.day !== calendarDate(new Date(), agency.timezone) ||
      hour < 9 ||
      hour >= 18
    )
      throw new Blocked("MESSAGE_WINDOW_EXPIRED");
    const n = await db.whatsAppNotification.findFirst({
      where: { id: payload.notificationId, agencyId: j.agencyId },
    });
    if (!n) throw new Blocked("NOTIFICATION_UNAVAILABLE");
    if (
      (n.purpose === "BOOKING_CONFIRMATION" && !p.notifications) ||
      (["PAYMENT_REMINDER", "DEPARTURE_REMINDER"].includes(n.purpose) &&
        !p.reminders) ||
      (n.purpose === "CUSTOMER_SERVICE" && !p.notifications)
    )
      throw new Blocked("PURPOSE_DISABLED");
    const result = await dispatchNotification(j.agencyId, n.id, transport);
    if (["SENDING", "UNKNOWN", "ALREADY_CLAIMED"].includes(result.status))
      throw new Blocked("RECONCILE_BEFORE_RETRY");
    return result;
  }
  if (j.kind === "DAILY_SUMMARY") {
    if (!p.summaries) throw new Blocked("SUMMARIES_DISABLED");
    const owner = await db.user.findFirst({
      where: { agencyId: j.agencyId, role: "OWNER", disabled: false },
    });
    if (!owner) throw new Blocked("OWNER_UNAVAILABLE");
    const report = await kpiData(
      { id: owner.id, agencyId: j.agencyId, role: "OWNER" },
      { from: payload.day, to: payload.day },
    );
    return {
      day: payload.day!,
      timezone: agency.timezone,
      currency: "INR",
      metrics: report.current,
      message:
        "Internal summary only. Manual ledger amounts are not verified payment collections.",
    };
  }
  if (j.kind === "INTEGRATION_ALERT") {
    if (!p.alerts) throw new Blocked("ALERTS_DISABLED");
    const c = await db.integrationConnection.findMany({
      where: {
        agencyId: j.agencyId,
        OR: [{ errorCode: { not: "" } }, { status: "NEEDS_REAUTH" }],
      },
      select: { id: true, provider: true, status: true, errorCode: true },
    });
    return {
      alerts: c,
      message: "Internal integration alerts; no customer message sent",
    };
  }
  throw new Blocked("UNKNOWN_JOB_KIND");
}
export async function executeClaim(
  j: AutomationJob,
  transport: typeof fetch = fetch,
) {
  try {
    // Lease fencing prevents an obsolete runner from starting after reclamation.
    if (
      !(await db.automationJob.count({
        where: {
          id: j.id,
          agencyId: j.agencyId,
          status: "RUNNING",
          leaseToken: j.leaseToken,
          leaseUntil: { gt: new Date() },
        },
      }))
    )
      return { status: "STALE" };
    const result = await perform(j, transport);
    await finish(j, "COMPLETE", "", result as Prisma.InputJsonValue);
    return { status: "COMPLETE" };
  } catch (e) {
    if (e instanceof Checkpoint) {
      await finish(j, "QUEUED", "SYNC_CHECKPOINT", undefined, 1000);
      return { status: "QUEUED" };
    }
    const busy =
      e instanceof HttpError &&
      e.status === 409 &&
      e.message === "Sync already running";
    const blocked =
      e instanceof Blocked ||
      (e instanceof ProviderError &&
        [
          "NEEDS_REAUTH",
          "PERMISSION",
          "INVALID_ACCOUNT",
          "INVALID_REQUEST",
          "META_VERSION_NOT_CONFIGURED",
          "GOOGLE_NOT_CONFIGURED",
          "NARROW_DATE_RANGE",
          "CONNECTION_CHANGED",
        ].includes(e.code)) ||
      (!busy &&
        e instanceof HttpError &&
        [400, 403, 404, 409, 503].includes(e.status));
    const code = busy
      ? "SYNC_BUSY"
      : e instanceof Blocked
        ? e.message
        : e instanceof ProviderError
          ? e.code
          : e instanceof HttpError && e.message.includes("uncertain")
            ? "RECONCILE_BEFORE_RETRY"
            : "EXECUTION_FAILED";
    const status =
      blocked || code === "RECONCILE_BEFORE_RETRY"
        ? "BLOCKED"
        : j.failures + 1 >= 5
          ? "DEAD"
          : "QUEUED";
    const delay =
      Math.min(3600000, 30000 * 2 ** Math.min(j.failures, 7)) +
      Math.floor(Math.random() * 5000);
    await finish(j, status, code, undefined, delay, true);
    return { status };
  }
}
async function finish(
  j: AutomationJob,
  status: string,
  errorCode: string,
  result?: Prisma.InputJsonValue,
  delay = 0,
  failed = false,
) {
  await db.$transaction(async (tx) => {
    const updated = await tx.automationJob.updateMany({
      where: {
        id: j.id,
        agencyId: j.agencyId,
        status: "RUNNING",
        leaseToken: j.leaseToken,
      },
      data: {
        status,
        errorCode,
        ...(result ? { result } : {}),
        availableAt: new Date(Date.now() + delay),
        leaseToken: "",
        leaseUntil: null,
        ...(failed ? { failures: { increment: 1 } } : {}),
      },
    });
    if (updated.count)
      await tx.automationAttempt.create({
        data: {
          agencyId: j.agencyId,
          jobId: j.id,
          attempt: j.attempts,
          status,
          errorCode,
        },
      });
  });
}
export async function runOne(transport: typeof fetch = fetch) {
  const j = await claimJob();
  return j
    ? { jobId: j.id, ...(await executeClaim(j, transport)) }
    : { status: "IDLE" };
}
export async function retryAutomation(input: Actor, id: string) {
  const a = await integrationActor(input, true),
    p = await db.automationPolicy.findUnique({
      where: { agencyId: a.agencyId },
    });
  if (!p?.enabled) throw new HttpError(409, "Enable automation first");
  const j = await db.automationJob.findFirst({
    where: { id, agencyId: a.agencyId, status: { in: ["DEAD", "BLOCKED"] } },
  });
  if (!j) throw new HttpError(404, "Retryable job not found");
  // Message outcomes may already exist at the provider; only a separate reconciliation can resolve them.
  if (j.kind === "WHATSAPP_SEND" || j.kind === "PLAN_MESSAGES")
    throw new HttpError(
      409,
      "Message jobs require manual reconciliation; blind retry is blocked",
    );
  await db.automationJob.updateMany({
    where: { id, agencyId: a.agencyId, status: j.status },
    data: {
      status: "QUEUED",
      failures: 0,
      errorCode: "",
      availableAt: new Date(),
      policyRevision: p.revision,
    },
  });
  await db.activity.create({
    data: {
      agencyId: a.agencyId,
      actor: a.id,
      action: "Automation job explicitly retried: " + id,
    },
  });
  return { message: "Safe job queued for retry" };
}
