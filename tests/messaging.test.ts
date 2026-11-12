import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { db } from "../src/lib/db";
import { mutate } from "../src/lib/actions";
import {
  provisionChannel,
  syncTemplates,
  configureMessaging,
  recordConsent,
  queueNotification,
  dispatchNotification,
  notificationPreview,
  messagingOverview,
} from "../src/lib/messaging/service";
import { receiveWhatsAppEvents } from "../src/lib/messaging/webhook";
import { scheduleManualNotification } from "../src/lib/automation/service";
import type { Actor } from "../src/lib/access";
test("official messaging enforces authorization, opt-in, dedupe, signatures, delivery ordering and uncertain-send safety", async () => {
  const old = { ...process.env },
    id = "wa-" + randomUUID();
  let sends = 0,
    uncertain = false;
  const transport: typeof fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.origin, "https://graph.facebook.com");
    if (u.pathname.endsWith("/phone_numbers"))
      return Response.json({
        data: [{ id: "123456", display_phone_number: "+91 9999999999" }],
      });
    if (u.pathname.endsWith("/message_templates"))
      return Response.json({
        data: [
          {
            name: "booking",
            language: "en",
            status: "APPROVED",
            components: [{ type: "BODY", text: "Hello {{1}}, booking {{2}}." }],
          },
        ],
      });
    assert.ok(u.pathname.endsWith("/messages"));
    sends++;
    if (uncertain) throw new Error("fictional timeout");
    const b = JSON.parse(String(init?.body));
    assert.equal(b.to, "919876543210");
    return Response.json({ messages: [{ id: "fictional-message-" + sends }] });
  };
  try {
    Object.assign(process.env, {
      INTEGRATION_ACTIVE_KEY: "test",
      INTEGRATION_ENCRYPTION_KEYS: JSON.stringify({ test: "33".repeat(32) }),
      META_GRAPH_VERSION: "v99.0",
      WHATSAPP_PROVISION_APPROVED: "true",
      WHATSAPP_LIVE_SEND_APPROVED: "false",
      WHATSAPP_APP_SECRET: "fictional-webhook-secret",
    });
    await db.agency.create({ data: { id, name: "Messaging fixture" } });
    await db.user.create({
      data: {
        id,
        agencyId: id,
        role: "OWNER",
        name: "Owner",
        email: id + "@example.test",
      },
    });
    const a: Actor = { id, agencyId: id, role: "OWNER" };
    const p = await db.package.create({
      data: {
        agencyId: id,
        name: "Trip",
        destination: "Bali",
        days: 3,
        price: 10000,
        estimatedCost: 5000,
        inclusions: "Hotel",
        exclusions: "Flight",
      },
    });
    const l = await db.lead.create({
      data: {
        agencyId: id,
        externalId: id,
        customer: "Customer",
        phone: "+919876543210",
        destination: "Bali",
        assignedId: id,
        travelStart: new Date("2027-01-01"),
        travelEnd: new Date("2027-01-03"),
        travellers: 1,
        budget: 10000,
        source: "Website",
      },
    });
    await mutate(a, "quote", {
      leadId: l.id,
      packageId: p.id,
      tax: "0",
      discount: "0",
    });
    const q = await db.quote.findFirstOrThrow({ where: { agencyId: id } });
    await mutate(a, "accept", { id: q.id, dueDate: "2026-12-31" });
    const b = await db.booking.findFirstOrThrow({ where: { agencyId: id } });
    const c = await provisionChannel(
      id,
      "654321",
      "123456",
      "fictional-token",
      transport,
    );
    assert.equal((await messagingOverview(a)).channels[0].enabled, false);
    await syncTemplates(a, c.id, transport);
    const t = await db.whatsAppTemplate.findFirstOrThrow({
      where: { agencyId: id },
    });
    await configureMessaging(a, {
      action: "template",
      id: t.id,
      purpose: "BOOKING_CONFIRMATION",
      slots: ["customer", "bookingId"],
    });
    await configureMessaging(a, { action: "channel", id: c.id, enabled: true });
    assert.match(
      (await notificationPreview(id, b.id, "BOOKING_CONFIRMATION")).text,
      /Hello Customer/,
    );
    await assert.rejects(
      queueNotification(id, b.id, "BOOKING_CONFIRMATION"),
      /not authorized/,
    );
    process.env.WHATSAPP_LIVE_SEND_APPROVED = "true";
    await assert.rejects(
      queueNotification(id, b.id, "BOOKING_CONFIRMATION"),
      /opt-in/,
    );
    await recordConsent(a, {
      phone: "+919876543210",
      optedIn: true,
      evidence: "Signed test opt-in evidence",
    });
    const n = await queueNotification(id, b.id, "BOOKING_CONFIRMATION");
    assert.equal(
      (await queueNotification(id, b.id, "BOOKING_CONFIRMATION")).id,
      n.id,
    );
    assert.equal(
      (await dispatchNotification(id, n.id, transport)).status,
      "ACCEPTED",
    );
    await dispatchNotification(id, n.id, transport);
    assert.equal(sends, 1);
    const event = (value: object) =>
      Buffer.from(
        JSON.stringify({
          object: "whatsapp_business_account",
          entry: [
            {
              id: "654321",
              changes: [
                {
                  field: "messages",
                  value: { metadata: { phone_number_id: "123456" }, ...value },
                },
              ],
            },
          ],
        }),
      );
    const signed = async (raw: Buffer) =>
      receiveWhatsAppEvents(
        raw,
        "sha256=" +
          createHmac("sha256", process.env.WHATSAPP_APP_SECRET!)
            .update(raw)
            .digest("hex"),
      );
    const raw = event({
      statuses: [
        {
          id: "fictional-message-1",
          status: "delivered",
          timestamp: String(Math.floor(Date.now() / 1000)),
        },
      ],
    });
    await assert.rejects(
      receiveWhatsAppEvents(raw, "sha256=" + "0".repeat(64)),
      /signature/,
    );
    await signed(raw);
    await signed(raw);
    await signed(
      event({
        statuses: [
          {
            id: "fictional-message-1",
            status: "sent",
            timestamp: String(Math.floor(Date.now() / 1000)),
          },
        ],
      }),
    );
    assert.equal(
      (await db.whatsAppNotification.findUniqueOrThrow({ where: { id: n.id } }))
        .status,
      "DELIVERED",
    );
    assert.equal(
      await db.messagingDeliveryEvent.count({ where: { agencyId: id } }),
      2,
    );
    await signed(
      event({
        messages: [
          {
            id: "stop-1",
            from: "919876543210",
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: "STOP" },
          },
        ],
      }),
    );
    assert.equal(
      (await db.messagingConsent.findFirstOrThrow({ where: { agencyId: id } }))
        .optedIn,
      false,
    );
    await configureMessaging(a, {
      action: "template",
      id: t.id,
      purpose: "CUSTOMER_SERVICE",
      slots: ["customer", "bookingId"],
    });
    await assert.rejects(
      queueNotification(id, b.id, "CUSTOMER_SERVICE"),
      /opt-in/,
    );
    await recordConsent(a, {
      phone: "+919876543210",
      optedIn: true,
      evidence: "Fresh explicit test opt-in",
    });
    await assert.rejects(
      scheduleManualNotification(a, b.id, "CUSTOMER_SERVICE"),
      /Enable/,
    );
    await db.automationPolicy.create({
      data: { agencyId: id, enabled: true, notifications: true },
    });
    const second = await scheduleManualNotification(
      a,
      b.id,
      "CUSTOMER_SERVICE",
    );
    assert.equal(
      await db.automationJob.count({
        where: { agencyId: id, kind: "WHATSAPP_SEND" },
      }),
      1,
    );
    await scheduleManualNotification(a, b.id, "CUSTOMER_SERVICE");
    assert.equal(
      await db.automationJob.count({
        where: { agencyId: id, kind: "WHATSAPP_SEND" },
      }),
      1,
    );
    uncertain = true;
    await assert.rejects(
      dispatchNotification(id, second.id, transport),
      /uncertain/,
    );
    assert.equal(
      (await dispatchNotification(id, second.id, transport)).status,
      "UNKNOWN",
    );
    assert.equal(sends, 2);
    await assert.rejects(messagingOverview({ ...a, agencyId: "foreign" }));
    await db.user.update({ where: { id }, data: { role: "AGENT" } });
    await assert.rejects(
      configureMessaging(a, { action: "channel", id: c.id, enabled: false }),
    );
  } finally {
    for (const k of [
      "INTEGRATION_ACTIVE_KEY",
      "INTEGRATION_ENCRYPTION_KEYS",
      "META_GRAPH_VERSION",
      "WHATSAPP_PROVISION_APPROVED",
      "WHATSAPP_LIVE_SEND_APPROVED",
      "WHATSAPP_APP_SECRET",
    ]) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
    for (const model of [
      db.automationAttempt,
      db.automationJob,
      db.automationPolicy,
      db.messagingDeliveryEvent,
      db.whatsAppNotification,
      db.whatsAppTemplate,
      db.whatsAppChannel,
      db.messagingConsentEvent,
      db.messagingConsent,
      db.activity,
      db.transaction,
      db.booking,
      db.quote,
      db.lead,
      db.package,
      db.user,
    ] as any[])
      await model.deleteMany({ where: { agencyId: id } });
    await db.agency.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
