import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { integrationActor } from "../integrations/service";
import type { Actor } from "../access";
import { requireOwner } from "../access";
import { HttpError } from "../http";
import { seal, unseal } from "../integrations/vault";
import { providerJson, ProviderError } from "../integrations/provider-http";
import { metaVersion } from "../integrations/meta";
import { whatsappNumber } from "../whatsapp";
import { balances, inr } from "../money";
import { calendarDate } from "../reporting-time";
import { subscriptionAccess } from "../subscriptions";
export const purposes = [
  "BOOKING_CONFIRMATION",
  "PAYMENT_REMINDER",
  "DEPARTURE_REMINDER",
  "CUSTOMER_SERVICE",
] as const;
export const slotNames = [
  "customer",
  "bookingId",
  "packageName",
  "travelStart",
  "dueDate",
  "amount",
  "status",
] as const;
const purpose = z.enum(purposes),
  slot = z.enum(slotNames),
  context = (agency: string, id: string) =>
    `travelos:whatsapp:v1:${agency}:${id}`;
export function liveMessagingApproved() {
  return process.env.WHATSAPP_LIVE_SEND_APPROVED === "true";
}
export async function provisionChannel(
  agencyId: string,
  wabaId: string,
  phoneId: string,
  token: string,
  transport: typeof fetch = fetch,
) {
  if (process.env.WHATSAPP_PROVISION_APPROVED !== "true")
    throw new HttpError(
      403,
      "Explicit agency/operator authorization is required for provisioning",
    );
  if (
    !/^\d{5,30}$/.test(wabaId) ||
    !/^\d{5,30}$/.test(phoneId) ||
    token.length < 10
  )
    throw new HttpError(400, "Invalid messaging account");
  const agency = await db.agency.findUniqueOrThrow({ where: { id: agencyId } });
  if (agency.demo) throw new HttpError(403, "Demo provisioning is disabled");
  const data = z
    .object({
      data: z.array(
        z.object({ id: z.string(), display_phone_number: z.string() }),
      ),
    })
    .parse(
      await providerJson(
        `https://graph.facebook.com/${metaVersion()}/${wabaId}/phone_numbers?fields=id,display_phone_number`,
        { headers: { Authorization: `Bearer ${token}` } },
        transport,
      ),
    );
  const phone = data.data.find((p) => p.id === phoneId);
  if (!phone)
    throw new HttpError(
      403,
      "Sending number is not authorized by this business",
    );
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phoneId}, 0))::text`;
    const old = await tx.whatsAppChannel.findUnique({ where: { phoneId } });
    if (old && old.agencyId !== agencyId)
      throw new HttpError(
        409,
        "Sending number is already assigned to another agency",
      );
    const id = old?.id || randomUUID();
    await tx.whatsAppChannel.upsert({
      where: { phoneId },
      create: {
        id,
        agencyId,
        wabaId,
        phoneId,
        displayPhone: phone.display_phone_number,
        credentials: seal({ token }, context(agencyId, id)),
      },
      update: {
        wabaId,
        displayPhone: phone.display_phone_number,
        credentials: seal({ token }, context(agencyId, id)),
        enabled: false,
        revision: { increment: 1 },
      },
    });
    return {
      id,
      message:
        "Authorized channel provisioned disabled. Sync templates and review agency consent/policies before enabling.",
    };
  });
}
export async function syncTemplates(
  inputActor: Actor,
  channelId: string,
  transport: typeof fetch = fetch,
) {
  const a = await integrationActor(inputActor, true),
    c = await db.whatsAppChannel.findFirst({
      where: { id: channelId, agencyId: a.agencyId },
    });
  if (!c) throw new HttpError(404, "Messaging channel not found");
  const { token } = unseal<{ token: string }>(
    c.credentials,
    context(a.agencyId, c.id),
  );
  let after = "";
  const templates: {
    name: string;
    language: string;
    status: string;
    body: string;
    parameterCount: number;
  }[] = [];
  for (let page = 0; page < 10; page++) {
    const url = new URL(
      `https://graph.facebook.com/${metaVersion()}/${c.wabaId}/message_templates`,
    );
    url.search = new URLSearchParams({
      fields: "name,language,status,components",
      limit: "100",
      ...(after ? { after } : {}),
    }).toString();
    const result = z
      .object({
        data: z.array(
          z.object({
            name: z.string().max(512),
            language: z.string().max(30),
            status: z.string(),
            components: z.array(
              z
                .object({
                  type: z.string(),
                  text: z.string().optional(),
                  format: z.string().optional(),
                })
                .passthrough(),
            ),
          }),
        ),
        paging: z
          .object({
            next: z.string().optional(),
            cursors: z.object({ after: z.string().optional() }).optional(),
          })
          .optional(),
      })
      .parse(
        await providerJson(
          url.toString(),
          { headers: { Authorization: `Bearer ${token}` } },
          transport,
        ),
      );
    for (const t of result.data) {
      const body = t.components.find((x) => x.type === "BODY")?.text || "";
      const indices = [
        ...new Set(
          [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])),
        ),
      ].sort((a, b) => a - b);
      const supported =
        !!body &&
        !body.replace(/\{\{[1-9]\d*\}\}/g, "").includes("{{") &&
        indices.every((v, i) => v === i + 1) &&
        indices.length <= 10 &&
        !t.components.some(
          (x) =>
            x.type !== "BODY" &&
            (JSON.stringify(x).includes("{{") ||
              ["IMAGE", "VIDEO", "DOCUMENT"].includes(x.format || "")),
        );
      templates.push({
        name: t.name,
        language: t.language,
        status: supported ? t.status : "UNSUPPORTED",
        body,
        parameterCount: indices.length,
      });
    }
    if (!result.paging?.next) break;
    after = result.paging.cursors?.after || "";
    if (!after || page === 9) throw new ProviderError("TEMPLATE_LIMIT");
  }
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WhatsAppChannel" WHERE id=${c.id} AND "agencyId"=${a.agencyId} FOR UPDATE`;
    const current = await tx.whatsAppChannel.findUniqueOrThrow({
      where: { id: c.id },
    });
    if (current.revision !== c.revision)
      throw new HttpError(409, "Messaging channel changed");
    await tx.whatsAppTemplate.updateMany({
      where: { channelId: c.id, agencyId: a.agencyId },
      data: { status: "NOT_IN_LATEST_SYNC" },
    });
    for (const t of templates) {
      const old = await tx.whatsAppTemplate.findUnique({
        where: {
          channelId_name_language: {
            channelId: c.id,
            name: t.name,
            language: t.language,
          },
        },
      });
      const changed =
        old && (old.body !== t.body || old.parameterCount !== t.parameterCount);
      await tx.whatsAppTemplate.upsert({
        where: {
          channelId_name_language: {
            channelId: c.id,
            name: t.name,
            language: t.language,
          },
        },
        create: { ...t, agencyId: a.agencyId, channelId: c.id },
        update: {
          ...t,
          ...(changed
            ? { purpose: "", slots: [], revision: { increment: 1 } }
            : {}),
        },
      });
    }
    await tx.activity.create({
      data: {
        agencyId: a.agencyId,
        actor: a.id,
        action: "WhatsApp template registry synchronized; no message sent",
      },
    });
  });
  return {
    message:
      "Provider template statuses synchronized. Review purpose and parameter mappings.",
  };
}
export async function messagingOverview(inputActor: Actor) {
  const a = await integrationActor(inputActor);
  return {
    liveApproved: liveMessagingApproved(),
    owner: a.role === "OWNER",
    channels: await db.whatsAppChannel.findMany({
      where: { agencyId: a.agencyId },
      select: { id: true, displayPhone: true, phoneId: true, enabled: true },
    }),
    templates: await db.whatsAppTemplate.findMany({
      where: { agencyId: a.agencyId },
      select: {
        id: true,
        channelId: true,
        name: true,
        language: true,
        body: true,
        status: true,
        parameterCount: true,
        purpose: true,
        slots: true,
      },
      take: 100,
    }),
    consents: await db.messagingConsent.findMany({
      where: { agencyId: a.agencyId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    notifications: await db.whatsAppNotification.findMany({
      where: { agencyId: a.agencyId },
      select: {
        id: true,
        bookingId: true,
        purpose: true,
        status: true,
        errorCode: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  };
}
export async function recordConsent(inputActor: Actor, input: unknown) {
  const a = await integrationActor(inputActor, true, true);
  requireOwner(a);
  const v = z
      .object({
        phone: z.string(),
        optedIn: z.boolean(),
        evidence: z.string().trim().min(10).max(500),
      })
      .parse(input),
    phone = whatsappNumber(v.phone);
  if (!phone)
    throw new HttpError(400, "Use an explicit international phone number");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Agency" WHERE id=${a.agencyId} FOR UPDATE`;
    await tx.messagingConsent.upsert({
      where: { agencyId_phone: { agencyId: a.agencyId, phone } },
      create: {
        agencyId: a.agencyId,
        phone,
        optedIn: v.optedIn,
        updatedAt: now,
      },
      update: { optedIn: v.optedIn, updatedAt: now },
    });
    await tx.messagingConsentEvent.create({
      data: {
        id: randomUUID(),
        agencyId: a.agencyId,
        phone,
        optedIn: v.optedIn,
        evidence: v.evidence,
        actor: a.id,
        occurredAt: now,
      },
    });
  });
  return { message: "Consent evidence recorded. No message sent." };
}
export async function configureMessaging(inputActor: Actor, input: unknown) {
  const v = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("channel"),
        id: z.string(),
        enabled: z.boolean(),
      }),
      z.object({
        action: z.literal("template"),
        id: z.string(),
        purpose,
        slots: z.array(slot).max(10),
      }),
    ])
    .parse(input);
  const a = await integrationActor(
    inputActor,
    true,
    v.action === "channel" && !v.enabled,
  );
  if (v.action === "channel") {
    const changed = await db.whatsAppChannel.updateMany({
      where: { id: v.id, agencyId: a.agencyId },
      data: { enabled: v.enabled, revision: { increment: 1 } },
    });
    if (!changed.count) throw new HttpError(404, "Channel not found");
  } else {
    const t = await db.whatsAppTemplate.findFirst({
      where: { id: v.id, agencyId: a.agencyId, status: "APPROVED" },
    });
    if (!t) throw new HttpError(404, "Approved template not found");
    if (t.parameterCount !== v.slots.length)
      throw new HttpError(
        400,
        "Parameter mapping must match every approved body placeholder",
      );
    await db.whatsAppTemplate.updateMany({
      where: {
        agencyId: a.agencyId,
        channelId: t.channelId,
        purpose: v.purpose,
        id: { not: t.id },
      },
      data: { purpose: "", slots: [], revision: { increment: 1 } },
    });
    await db.whatsAppTemplate.update({
      where: { id: t.id },
      data: { purpose: v.purpose, slots: v.slots, revision: { increment: 1 } },
    });
  }
  await db.activity.create({
    data: {
      agencyId: a.agencyId,
      actor: a.id,
      action: `Messaging ${v.action} configuration updated; no message sent`,
    },
  });
  return {
    message:
      "Messaging configuration saved. Global live authorization and consent are still required.",
  };
}
export async function notificationPreview(
  agencyId: string,
  bookingId: string,
  kind: string,
) {
  const k = purpose.parse(kind),
    b = await db.booking.findFirst({
      where: { id: bookingId, agencyId },
      include: { lead: true, quote: true, agency: true },
    });
  if (!b) throw new HttpError(404, "Booking unavailable");
  if (b.status === "Cancelled" && k !== "CUSTOMER_SERVICE")
    throw new HttpError(
      409,
      "Cancelled booking cannot receive this notification",
    );
  const transactions = await db.transaction.findMany({
      where: { agencyId, bookingId },
    }),
    balance = balances({ ...b, transactions });
  if (k === "PAYMENT_REMINDER" && balance.customerDue <= 0)
    throw new HttpError(409, "No recorded customer balance is due");
  const channel = await db.whatsAppChannel.findFirst({
    where: { agencyId, enabled: true },
  });
  if (!channel) throw new HttpError(409, "No enabled messaging channel");
  const t = await db.whatsAppTemplate.findFirst({
    where: { agencyId, channelId: channel.id, status: "APPROVED", purpose: k },
    orderBy: { id: "asc" },
  });
  if (!t)
    throw new HttpError(
      409,
      "No approved mapped template for this notification",
    );
  const phone = whatsappNumber(b.lead.phone);
  if (!phone)
    throw new HttpError(400, "Booking phone needs an explicit country code");
  const fields = {
    customer: b.lead.customer,
    bookingId: b.id,
    packageName: b.quote.packageName,
    travelStart: b.travelStart.toISOString().slice(0, 10),
    dueDate: b.dueDate.toISOString().slice(0, 10),
    amount: inr(balance.customerDue),
    status: b.status,
  };
  const slots = z.array(slot).parse(t.slots);
  if (slots.length !== t.parameterCount)
    throw new HttpError(409, "Template mapping needs review");
  const parameters = slots.map((s) => fields[s]);
  const text = t.body.replace(
    /\{\{(\d+)\}\}/g,
    (_, n) => parameters[Number(n) - 1],
  );
  return {
    channel,
    t,
    phone,
    parameters,
    text,
    occurrence:
      k === "BOOKING_CONFIRMATION"
        ? "booking-confirmation"
        : calendarDate(new Date(), b.agency.timezone),
    agencyTimezone: b.agency.timezone,
  };
}
export async function queueNotification(
  agencyId: string,
  bookingId: string,
  kind: string,
) {
  if (!liveMessagingApproved())
    throw new HttpError(
      503,
      "Live WhatsApp sending is not authorized. Preview only.",
    );
  const p = await notificationPreview(agencyId, bookingId, kind);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Agency" WHERE id=${agencyId} FOR UPDATE`;
    const consent = await tx.messagingConsent.findUnique({
      where: { agencyId_phone: { agencyId, phone: p.phone } },
    });
    if (!consent?.optedIn)
      throw new HttpError(409, "Customer opt-in is missing or withdrawn");
    const key = {
      agencyId,
      bookingId,
      purpose: kind,
      occurrence: p.occurrence,
    };
    const existing = await tx.whatsAppNotification.findUnique({
      where: { agencyId_bookingId_purpose_occurrence: key },
    });
    if (existing)
      return {
        id: existing.id,
        message: "Notification already recorded; no duplicate queued",
      };
    const count = await tx.whatsAppNotification.count({
      where: {
        agencyId,
        phone: p.phone,
        createdAt: { gte: new Date(Date.now() - 86400000) },
        status: { notIn: ["CANCELLED", "FAILED"] },
      },
    });
    if (count >= 2)
      throw new HttpError(
        429,
        "Recipient notification frequency limit reached",
      );
    const n = await tx.whatsAppNotification.create({
      data: {
        ...key,
        channelId: p.channel.id,
        templateId: p.t.id,
        phone: p.phone,
        parameters: p.parameters,
        templateRevision: p.t.revision,
        channelRevision: p.channel.revision,
      },
    });
    return { id: n.id, message: "Notification queued, not sent or delivered" };
  });
}
export async function dispatchNotification(
  agencyId: string,
  id: string,
  transport: typeof fetch = fetch,
) {
  if (!liveMessagingApproved())
    throw new HttpError(503, "Live WhatsApp sending is not authorized");
  const n = await db.whatsAppNotification.findFirst({
    where: { id, agencyId },
    include: { channel: true, template: true },
  });
  if (!n) throw new HttpError(404, "Notification unavailable");
  if (n.status !== "QUEUED") return { status: n.status };
  const consent = await db.messagingConsent.findUnique({
    where: { agencyId_phone: { agencyId, phone: n.phone } },
  });
  const agency = await db.agency.findUniqueOrThrow({ where: { id: agencyId } });
  const valid =
    subscriptionAccess(agency) &&
    n.channel.enabled &&
    n.channel.revision === n.channelRevision &&
    n.template.status === "APPROVED" &&
    n.template.revision === n.templateRevision &&
    consent?.optedIn &&
    !agency.demo;
  const b = await db.booking.findFirst({
    where: { id: n.bookingId, agencyId },
    include: { transactions: true },
  });
  if (
    !valid ||
    !b ||
    (b.status === "Cancelled" && n.purpose !== "CUSTOMER_SERVICE") ||
    (n.purpose === "PAYMENT_REMINDER" && balances(b).customerDue <= 0)
  ) {
    await db.whatsAppNotification.updateMany({
      where: { id, agencyId, status: "QUEUED" },
      data: {
        status: "CANCELLED",
        errorCode: "CONSENT_CONFIG_OR_BOOKING_CHANGED",
      },
    });
    return { status: "CANCELLED" };
  }
  if (
    !(
      await db.whatsAppNotification.updateMany({
        where: { id, agencyId, status: "QUEUED" },
        data: { status: "SENDING" },
      })
    ).count
  )
    return { status: "ALREADY_CLAIMED" };
  try {
    const { token } = unseal<{ token: string }>(
      n.channel.credentials,
      context(agencyId, n.channel.id),
    );
    const current = await notificationPreview(agencyId, n.bookingId, n.purpose);
    if (
      current.channel.id !== n.channelId ||
      current.t.id !== n.templateId ||
      current.phone !== n.phone ||
      current.channel.revision !== n.channelRevision ||
      current.t.revision !== n.templateRevision
    )
      throw new Error("Configuration changed");
    const parameters = current.parameters;
    await db.whatsAppNotification.update({
      where: { id: n.id },
      data: { parameters },
    });
    const latestConsent = await db.messagingConsent.findUnique({
      where: { agencyId_phone: { agencyId, phone: n.phone } },
    });
    if (!latestConsent?.optedIn) {
      await db.whatsAppNotification.update({
        where: { id: n.id },
        data: { status: "CANCELLED", errorCode: "OPTED_OUT_BEFORE_SEND" },
      });
      return { status: "CANCELLED" };
    }
    const response = z
      .object({
        messages: z.array(z.object({ id: z.string().min(1).max(300) })).min(1),
      })
      .parse(
        await providerJson(
          `https://graph.facebook.com/${metaVersion()}/${n.channel.phoneId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: n.phone,
              type: "template",
              template: {
                name: n.template.name,
                language: { code: n.template.language },
                ...(parameters.length
                  ? {
                      components: [
                        {
                          type: "body",
                          parameters: parameters.map((text) => ({
                            type: "text",
                            text,
                          })),
                        },
                      ],
                    }
                  : {}),
              },
            }),
          },
          transport,
        ),
      );
    await db.whatsAppNotification.update({
      where: { id },
      data: { status: "ACCEPTED", providerMessageId: response.messages[0].id },
    });
    return { status: "ACCEPTED" };
  } catch {
    await db.whatsAppNotification.updateMany({
      where: { id, agencyId, status: "SENDING" },
      data: { status: "UNKNOWN", errorCode: "RECONCILE_BEFORE_RETRY" },
    });
    throw new HttpError(
      502,
      "Send outcome uncertain. Automatic resend is blocked; reconcile with provider before retrying.",
    );
  }
}
