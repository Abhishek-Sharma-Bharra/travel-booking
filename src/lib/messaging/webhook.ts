import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { HttpError } from "../http";
export function verifyWhatsAppSignature(
  raw: Uint8Array,
  signature: string | null,
  secret = process.env.WHATSAPP_APP_SECRET || "",
) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature))
    return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const timestamp = z
  .string()
  .regex(/^\d{9,12}$/)
  .transform((s) => new Date(Number(s) * 1000))
  .refine((d) => !isNaN(+d));
const schema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        id: z.string(),
        changes: z
          .array(
            z.object({
              field: z.string(),
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }).optional(),
                statuses: z
                  .array(
                    z.object({
                      id: z.string().max(300),
                      status: z.enum(["sent", "delivered", "read", "failed"]),
                      timestamp,
                    }),
                  )
                  .max(100)
                  .optional(),
                messages: z
                  .array(
                    z.object({
                      id: z.string().max(300),
                      from: z.string().regex(/^[1-9]\d{7,14}$/),
                      timestamp,
                      type: z.string(),
                      text: z.object({ body: z.string().max(4000) }).optional(),
                    }),
                  )
                  .max(100)
                  .optional(),
              }),
            }),
          )
          .max(100),
      }),
    )
    .max(50),
});
export async function receiveWhatsAppEvents(
  raw: Uint8Array,
  signature: string | null,
) {
  if (!verifyWhatsAppSignature(raw, signature))
    throw new HttpError(401, "Invalid webhook signature");
  let input;
  try {
    input = schema.parse(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    throw new HttpError(400, "Invalid webhook body");
  }
  for (const entry of input.entry)
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const phoneId = change.value.metadata?.phone_number_id;
      if (!phoneId) continue;
      const c = await db.whatsAppChannel.findFirst({
        where: { phoneId, wabaId: entry.id },
      });
      if (!c) continue;
      for (const event of change.value.statuses || []) {
        const n = await db.whatsAppNotification.findFirst({
          where: {
            agencyId: c.agencyId,
            channelId: c.id,
            providerMessageId: event.id,
          },
        });
        if (!n) continue;
        const id = hash(
          `${phoneId}:${event.id}:${event.status}:${+event.timestamp}`,
        );
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "WhatsAppNotification" WHERE id=${n.id} AND "agencyId"=${c.agencyId} FOR UPDATE`;
          if (await tx.messagingDeliveryEvent.findUnique({ where: { id } }))
            return;
          await tx.messagingDeliveryEvent.create({
            data: {
              id,
              agencyId: c.agencyId,
              notificationId: n.id,
              status: event.status,
              occurredAt: event.timestamp,
            },
          });
          const current = await tx.whatsAppNotification.findUniqueOrThrow({
            where: { id: n.id },
          });
          const rank: Record<string, number> = {
            QUEUED: 0,
            SENDING: 0,
            UNKNOWN: 0,
            ACCEPTED: 1,
            SENT: 2,
            FAILED: 2,
            DELIVERED: 3,
            READ: 4,
          };
          const status = event.status.toUpperCase();
          if (
            (status === "FAILED" && (rank[current.status] || 0) < 3) ||
            (status !== "FAILED" &&
              (rank[status] || 0) > (rank[current.status] || 0))
          )
            await tx.whatsAppNotification.update({
              where: { id: n.id },
              data: {
                status,
                errorCode:
                  status === "FAILED" ? "PROVIDER_DELIVERY_FAILED" : "",
              },
            });
        });
      }
      for (const message of change.value.messages || []) {
        if (
          message.type !== "text" ||
          !["STOP", "UNSUBSCRIBE", "CANCEL", "बंद"].includes(
            message.text?.body.trim().toUpperCase() || "",
          )
        )
          continue;
        const id = hash(`${phoneId}:${message.id}:optout`);
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Agency" WHERE id=${c.agencyId} FOR UPDATE`;
          if (await tx.messagingConsentEvent.findUnique({ where: { id } }))
            return;
          await tx.messagingConsentEvent.create({
            data: {
              id,
              agencyId: c.agencyId,
              phone: message.from,
              optedIn: false,
              evidence: "Signed provider opt-out keyword",
              actor: "provider-webhook",
              occurredAt: message.timestamp,
            },
          });
          const old = await tx.messagingConsent.findUnique({
            where: {
              agencyId_phone: { agencyId: c.agencyId, phone: message.from },
            },
          });
          if (!old || +old.updatedAt <= +message.timestamp + 999)
            await tx.messagingConsent.upsert({
              where: {
                agencyId_phone: { agencyId: c.agencyId, phone: message.from },
              },
              create: {
                agencyId: c.agencyId,
                phone: message.from,
                optedIn: false,
                updatedAt: message.timestamp,
              },
              update: { optedIn: false, updatedAt: message.timestamp },
            });
        });
      }
    }
  return { received: true };
}
