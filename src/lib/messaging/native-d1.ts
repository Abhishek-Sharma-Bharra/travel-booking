import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../access";
import { db } from "../db";
import { commerceDb, hash, manager, managerGuard } from "../commerce/documents";
import { integrationActor } from "../integrations/service";
import { seal, unseal } from "../integrations/vault";
import { providerJson } from "../integrations/provider-http";
import { metaVersion } from "../integrations/meta";
import { guardedD1Batch } from "../d1/atomic";
import { HttpError } from "../http";
import { whatsappNumber } from "../whatsapp";
import { inr } from "../money";
type Channel = {
  agencyId: string;
  phoneId: string;
  wabaId: string;
  displayPhone: string;
  credential: string;
  revision: number;
};
const templateSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]{1,100}$/),
  language: z.string().max(30),
  status: z.string(),
  category: z.string(),
  components: z.array(
    z
      .object({
        type: z.string(),
        text: z.string().optional(),
        format: z.string().optional(),
      })
      .passthrough(),
  ),
});
type Template = z.infer<typeof templateSchema>;
const context = (agencyId: string) => "native-whatsapp:" + agencyId;
async function request(
  c: Channel,
  path: string,
  body: unknown,
  transport: typeof fetch,
) {
  return providerJson(
    `https://graph.facebook.com/${metaVersion()}/${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization:
          "Bearer " +
          unseal<{ token: string }>(c.credential, context(c.agencyId)).token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    transport,
  );
}
async function channel(agencyId: string) {
  const c = await commerceDb()
    .prepare("SELECT * FROM NativeWhatsAppChannel WHERE agencyId=?")
    .bind(agencyId)
    .first<Channel>();
  if (!c)
    throw new HttpError(
      409,
      "Connect the official WhatsApp business number first",
    );
  return c;
}
export async function connectNativeWhatsApp(
  a: Actor,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  await integrationActor(a, true);
  if (process.env.WHATSAPP_PROVISION_APPROVED !== "true")
    throw new HttpError(
      503,
      "Official WhatsApp provisioning is not approved yet",
    );
  const v = z
    .object({
      phoneId: z.string().regex(/^\d{5,30}$/),
      wabaId: z.string().regex(/^\d{5,30}$/),
      token: z.string().min(10).max(5000),
      authorised: z.literal(true),
    })
    .strict()
    .parse(input);
  const c = {
    agencyId: a.agencyId,
    phoneId: v.phoneId,
    wabaId: v.wabaId,
    displayPhone: "",
    credential: seal({ token: v.token }, context(a.agencyId)),
    revision: 0,
  };
  const result = z
    .object({
      data: z.array(
        z.object({ id: z.string(), display_phone_number: z.string() }),
      ),
      paging: z.object({ next: z.string().optional() }).optional(),
    })
    .parse(
      await request(
        c,
        `${v.wabaId}/phone_numbers?fields=id,display_phone_number&limit=100`,
        undefined,
        transport,
      ),
    );
  const phone = result.data.find((p) => p.id === v.phoneId);
  if (!phone)
    throw new HttpError(403, "Number is not authorised by this business token");
  await guardedD1Batch(
    commerceDb(),
    [
      {
        sql: "SELECT COUNT(*)=1 FROM User WHERE id=? AND agencyId=? AND role='OWNER' AND disabled=0",
        values: [a.id, a.agencyId],
      },
    ],
    [
      {
        sql: "INSERT INTO NativeWhatsAppChannel(agencyId,phoneId,wabaId,displayPhone,credential,createdAt) VALUES(?,?,?,?,?,?) ON CONFLICT(agencyId) DO UPDATE SET phoneId=excluded.phoneId,wabaId=excluded.wabaId,displayPhone=excluded.displayPhone,credential=excluded.credential,revision=revision+1",
        values: [
          a.agencyId,
          v.phoneId,
          v.wabaId,
          phone.display_phone_number,
          c.credential,
          new Date().toISOString(),
        ],
      },
    ],
  );
  return { connected: true };
}
export async function nativeTemplates(
  a: Actor,
  transport: typeof fetch = fetch,
) {
  await manager(a);
  const c = await channel(a.agencyId),
    list: Template[] = [];
  let cursor = "";
  const seen = new Set<string>();
  for (let n = 0; n < 3; n++) {
    const q = new URLSearchParams({
      fields: "name,language,status,category,components",
      limit: "100",
      ...(cursor ? { after: cursor } : {}),
    });
    const page = z
      .object({
        data: z.array(templateSchema),
        paging: z
          .object({
            cursors: z.object({ after: z.string().optional() }).optional(),
            next: z.string().optional(),
          })
          .optional(),
      })
      .parse(
        await request(
          c,
          `${c.wabaId}/message_templates?${q}`,
          undefined,
          transport,
        ),
      );
    list.push(...page.data);
    if (!page.paging?.next)
      return list.filter(
        (t) =>
          t.status === "APPROVED" &&
          ["UTILITY", "MARKETING"].includes(t.category) &&
          t.components.every((x) => ["BODY", "FOOTER"].includes(x.type)) &&
          t.components.some((x) => x.type === "BODY"),
      );
    const next = page.paging.cursors?.after;
    if (!next || seen.has(next))
      throw new HttpError(502, "Invalid template pagination");
    seen.add(next);
    cursor = next;
  }
  throw new HttpError(422, "Template volume exceeds the reviewed pilot limit");
}
export async function consentNative(a: Actor, input: unknown) {
  await manager(a);
  const v = z
      .object({
        bookingId: z.string().min(1).max(100),
        purpose: z.enum(["SERVICE", "MARKETING"]),
        optedIn: z.boolean(),
        evidence: z.string().trim().min(10).max(600),
      })
      .strict()
      .parse(input),
    booking = await db.booking.findFirst({
      where: { id: v.bookingId, agencyId: a.agencyId },
      include: { lead: true },
    });
  if (!booking) throw new HttpError(404, "Booking not found");
  const phone = whatsappNumber(booking.lead.phone);
  if (!phone)
    throw new HttpError(
      400,
      "Maintain an explicit international customer number first",
    );
  await guardedD1Batch(
    commerceDb(),
    [managerGuard(a)],
    [
      {
        sql: "INSERT INTO NativeWhatsAppConsent(id,agencyId,bookingId,phone,purpose,optedIn,evidence,actorId,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
        values: [
          randomUUID(),
          a.agencyId,
          v.bookingId,
          phone,
          v.purpose,
          v.optedIn ? 1 : 0,
          v.evidence,
          a.id,
          new Date().toISOString(),
        ],
      },
    ],
  );
  return { saved: true };
}
const slots = z.enum([
  "customer",
  "agency",
  "bookingId",
  "travelStart",
  "total",
]);
const sendSchema = z
  .object({
    requestId: z.string().uuid(),
    bookingId: z.string().min(1).max(100),
    template: z.string().regex(/^[a-z0-9_]{1,100}$/),
    language: z.string().min(1).max(30),
    slots: z.array(slots).max(10),
    reviewed: z.literal(true),
  })
  .strict();
export async function previewNative(
  a: Actor,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  await manager(a);
  const v = sendSchema.parse(input),
    c = await channel(a.agencyId),
    booking = await db.booking.findFirst({
      where: { id: v.bookingId, agencyId: a.agencyId },
      include: { lead: true, agency: true },
    });
  if (!booking) throw new HttpError(404, "Booking not found");
  const phone = whatsappNumber(booking.lead.phone);
  if (!phone)
    throw new HttpError(400, "Use an explicit international customer number");
  const templates = await nativeTemplates(a, transport),
    t = templates.find(
      (t) => t.name === v.template && t.language === v.language,
    );
  if (!t)
    throw new HttpError(
      409,
      "An approved plain-text template is required; media and button templates are not supported by this pilot",
    );
  const text = t.components.find((x) => x.type === "BODY")?.text || "",
    parameters = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])),
    indexes = [...new Set(parameters)].sort((a, b) => a - b);
  if (indexes.length !== v.slots.length || indexes.some((n, i) => n !== i + 1))
    throw new HttpError(400, "Map every template parameter in order");
  const values = {
    customer: booking.lead.customer,
    agency: booking.agency.name,
    bookingId: booking.id,
    travelStart: new Date(booking.travelStart).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
    total: inr(booking.total),
  };
  const body = v.slots.map((s) => String(values[s]));
  if (body.some((s) => s.length > 300 || /[\r\n\t]/.test(s)))
    throw new HttpError(400, "Template values exceed supported text bounds");
  return {
    input: v,
    channel: c,
    phone,
    rawPhone: booking.lead.phone,
    purpose: t.category === "MARKETING" ? "MARKETING" : "SERVICE",
    text: text.replace(/\{\{(\d+)\}\}/g, (_, n) => body[Number(n) - 1]),
    parameters: body,
  };
}
export async function sendNative(
  a: Actor,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  const v = sendSchema.parse(input);
  await manager(a);
  if (process.env.WHATSAPP_LIVE_SEND_APPROVED !== "true")
    throw new HttpError(
      503,
      "Live WhatsApp sends are not approved; no message was sent",
    );
  const b = commerceDb(),
    old = await b
      .prepare(
        "SELECT id,state,payloadHash FROM NativeWhatsAppOutbox WHERE agencyId=? AND requestId=?",
      )
      .bind(a.agencyId, v.requestId)
      .first<{ id: string; state: string; payloadHash: string }>(),
    payloadHash = hash(JSON.stringify(v));
  if (old) {
    if (old.payloadHash !== payloadHash)
      throw new HttpError(
        409,
        "Messaging request ID was reused with different details",
      );
    return { id: old.id, state: old.state, replayed: true };
  }
  const p = await previewNative(a, v, transport),
    id = randomUUID(),
    now = new Date().toISOString();
  await guardedD1Batch(
    b,
    [
      managerGuard(a),
      {
        sql: "SELECT COUNT(*)=0 FROM NativeWhatsAppOutbox WHERE agencyId=? AND bookingId=? AND template=? AND language=? AND phone=? AND state IN ('SENDING','UNKNOWN')",
        values: [a.agencyId, v.bookingId, v.template, v.language, p.phone],
      },
      {
        sql: "SELECT COUNT(*)=1 FROM NativeWhatsAppChannel WHERE agencyId=? AND revision=? AND phoneId=?",
        values: [a.agencyId, p.channel.revision, p.channel.phoneId],
      },
      {
        sql: "SELECT optedIn=1 AND phone=? FROM NativeWhatsAppConsent WHERE agencyId=? AND bookingId=? AND purpose=? ORDER BY rowid DESC LIMIT 1",
        values: [p.phone, a.agencyId, v.bookingId, p.purpose],
      },
      {
        sql: "SELECT COUNT(*)<50 FROM NativeWhatsAppOutbox WHERE agencyId=? AND createdAt>?",
        values: [a.agencyId, new Date(Date.now() - 86400000).toISOString()],
      },
      {
        sql: "SELECT COUNT(*)=1 FROM Booking b JOIN Lead l ON l.id=b.leadId AND l.agencyId=b.agencyId WHERE b.id=? AND b.agencyId=? AND l.phone=?",
        values: [v.bookingId, a.agencyId, p.rawPhone],
      },
    ],
    [
      {
        sql: "INSERT INTO NativeWhatsAppOutbox(id,agencyId,bookingId,requestId,payloadHash,phoneId,phone,template,language,state,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,'SENDING',?,?)",
        values: [
          id,
          a.agencyId,
          v.bookingId,
          v.requestId,
          payloadHash,
          p.channel.phoneId,
          p.phone,
          v.template,
          v.language,
          now,
          now,
        ],
      },
    ],
  );
  try {
    const response = z
      .object({
        messages: z
          .array(z.object({ id: z.string().min(1).max(300) }))
          .length(1),
      })
      .parse(
        await request(
          p.channel,
          `${p.channel.phoneId}/messages`,
          {
            messaging_product: "whatsapp",
            biz_opaque_callback_data: id,
            to: p.phone,
            type: "template",
            template: {
              name: v.template,
              language: { code: v.language },
              components: p.parameters.length
                ? [
                    {
                      type: "body",
                      parameters: p.parameters.map((text) => ({
                        type: "text",
                        text,
                      })),
                    },
                  ]
                : [],
            },
          },
          transport,
        ),
      );
    await b
      .prepare(
        "UPDATE NativeWhatsAppOutbox SET providerId=?,state='SENT',updatedAt=? WHERE id=? AND state='SENDING'",
      )
      .bind(response.messages[0].id, new Date().toISOString(), id)
      .run();
    return { id, state: "SENT" };
  } catch {
    await b
      .prepare(
        "UPDATE NativeWhatsAppOutbox SET state='UNKNOWN',updatedAt=? WHERE id=? AND state='SENDING'",
      )
      .bind(new Date().toISOString(), id)
      .run();
    throw new HttpError(
      503,
      "Send result is uncertain. Do not resend; reconcile provider delivery before another message.",
    );
  }
}
export async function nativeWhatsAppOverview(a: Actor) {
  await manager(a, false);
  const b = commerceDb(),
    c = await b
      .prepare(
        "SELECT phoneId,displayPhone FROM NativeWhatsAppChannel WHERE agencyId=?",
      )
      .bind(a.agencyId)
      .first();
  return {
    channel: c,
    provisionApproved: process.env.WHATSAPP_PROVISION_APPROVED === "true",
    liveApproved: process.env.WHATSAPP_LIVE_SEND_APPROVED === "true",
    outbox: (
      await b
        .prepare(
          "SELECT id,bookingId,template,language,state,createdAt FROM NativeWhatsAppOutbox WHERE agencyId=? ORDER BY createdAt DESC LIMIT 50",
        )
        .bind(a.agencyId)
        .all()
    ).results,
  };
}
export async function nativeWhatsAppWebhook(
  raw: Uint8Array,
  signature: string,
) {
  const secret = process.env.META_APP_SECRET;
  if (
    !secret ||
    !/^sha256=[a-f0-9]{64}$/i.test(signature) ||
    !timingSafeEqual(
      Buffer.from(signature.slice(7), "hex"),
      Buffer.from(
        createHmac("sha256", secret).update(raw).digest("hex"),
        "hex",
      ),
    )
  )
    throw new HttpError(401, "Invalid WhatsApp webhook signature");
  const body = z
    .object({
      entry: z.array(
        z.object({
          changes: z.array(
            z.object({
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }).optional(),
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.enum(["sent", "delivered", "read", "failed"]),
                      recipient_id: z.string(),
                      biz_opaque_callback_data: z.string().optional(),
                    }),
                  )
                  .optional(),
              }),
            }),
          ),
        }),
      ),
    })
    .parse(JSON.parse(new TextDecoder().decode(raw)));
  let count = 0;
  for (const entry of body.entry)
    for (const change of entry.changes)
      for (const s of change.value.statuses || []) {
        if (++count > 100)
          throw new HttpError(413, "Webhook batch exceeds limit");
        const next = s.status.toUpperCase();
        await commerceDb()
          .prepare(
            `UPDATE NativeWhatsAppOutbox SET state=?,providerId=COALESCE(providerId,?),updatedAt=? WHERE (providerId=? OR (providerId IS NULL AND id=? AND state IN ('SENDING','UNKNOWN'))) AND phoneId=? AND phone=? AND ((?='READ' AND state IN ('SENDING','UNKNOWN','SENT','DELIVERED')) OR (?='DELIVERED' AND state IN ('SENDING','UNKNOWN','SENT')) OR (?='SENT' AND state IN ('SENDING','UNKNOWN')) OR (?='FAILED' AND state IN ('SENDING','UNKNOWN','SENT')))`,
          )
          .bind(
            next,
            s.id,
            new Date().toISOString(),
            s.id,
            s.biz_opaque_callback_data || "",
            change.value.metadata?.phone_number_id || "",
            s.recipient_id,
            next,
            next,
            next,
            next,
          )
          .run();
      }
  return { accepted: true };
}
