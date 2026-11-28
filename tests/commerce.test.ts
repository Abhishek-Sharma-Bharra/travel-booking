import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { requestResources, closeResources } from "../src/lib/request-resources";
import { db } from "../src/lib/db";
import {
  issueDocument,
  calculateDocument,
  validGstin,
  financialYear,
} from "../src/lib/commerce/documents";
import {
  inviteCustomer,
  consumeInvitation,
  customerOverview,
  revokeCustomerAccess,
  portalGrant,
} from "../src/lib/commerce/portal";
import {
  createCustomerOrder,
  reconcileCapturedPayment,
  reconcileProviderRefund,
  paymentWebhook,
  merchant,
} from "../src/lib/commerce/payments";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "commerce-test" },
  }),
);
let binding: D1Database;
before(async () => {
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  binding = await mf.getD1Database("DB");
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const f of (await readdir("cloudflare/d1/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile("cloudflare/d1/migrations/" + f, "utf8"),
      ).map((s) => binding.prepare(s)),
    );
});
after(() => mf.dispose());
async function scope<T>(fn: () => Promise<T>) {
  const r = {
    databaseEngine: "d1" as const,
    databaseUrl: "",
    d1: binding,
    values: new Map(),
    cleanup: [],
  };
  return requestResources.run(r, async () => {
    try {
      return await fn();
    } finally {
      await closeResources(r);
    }
  });
}
async function fixture() {
  const agency = await db.agency.create({
    data: {
      name: "Fictional commerce",
      subscription: "Active",
      subscriptionExpiresAt: new Date(Date.now() + 86400000),
    },
  });
  const u = await db.user.create({
    data: {
      id: randomUUID(),
      name: "Owner",
      email: randomUUID() + "@test.invalid",
      agencyId: agency.id,
      role: "OWNER",
    },
  });
  const a = { id: u.id, agencyId: agency.id, role: "OWNER" };
  const lead = await db.lead.create({
    data: {
      agencyId: agency.id,
      externalId: randomUUID(),
      customer: "Portal Customer",
      email: "customer-" + randomUUID() + "@test.invalid",
      phone: "",
      destination: "Manali",
      travelStart: new Date("2026-12-10"),
      travelEnd: new Date("2026-12-15"),
      travellers: 1,
      budget: 118000,
      source: "Website",
      assignedId: u.id,
      notes: "PRIVATE LEAD NOTE",
    },
  });
  const pkg = await db.package.create({
    data: {
      agencyId: agency.id,
      name: "Test package",
      destination: "Manali",
      days: 5,
      inclusions: "Stay",
      exclusions: "Flights",
      price: 100000,
      estimatedCost: 50000,
    },
  });
  const quote = await db.quote.create({
    data: {
      agencyId: agency.id,
      leadId: lead.id,
      packageId: pkg.id,
      travellers: 1,
      unitPrice: 100000,
      travelStart: lead.travelStart,
      travelEnd: lead.travelEnd,
      packageName: "Maintained snapshot",
      destination: "Manali",
      duration: 5,
      inclusions: "Stay",
      exclusions: "Flights",
      discount: 0,
      taxBps: 1800,
      total: 118000,
      estimatedCost: 50000,
      status: "Accepted",
      proposal: "Agreed day-by-day itinerary",
      paymentTerms: "Pay before departure",
      cancellationTerms: "Reviewed cancellation terms",
    },
  });
  const booking = await db.booking.create({
    data: {
      agencyId: agency.id,
      leadId: lead.id,
      quoteId: quote.id,
      total: 118000,
      dueDate: lead.travelStart,
      travelStart: lead.travelStart,
      travelEnd: lead.travelEnd,
    },
  });
  return { a, lead, booking };
}
function gstin(base: string) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let factor = 2,
    sum = 0;
  for (let i = 13; i >= 0; i--) {
    const n = chars.indexOf(base[i]) * factor;
    sum += Math.floor(n / 36) + (n % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return base + chars[(36 - (sum % 36)) % 36];
}
const supplier = {
    name: "Fictional supplier",
    address: "Fictional address New Delhi",
    stateCode: "07",
    gstin: gstin("07ABCDE1234F1Z"),
  },
  recipient = {
    name: "Fictional traveller",
    address: "Fictional traveller address",
    stateCode: "07",
    gstin: "",
  };
function input(bookingId: string) {
  return {
    requestId: randomUUID(),
    bookingId,
    kind: "INVOICE" as const,
    supplier,
    recipient,
    placeOfSupply: "07",
    lines: [
      {
        description: "Reviewed travel service",
        sac: "998555",
        taxablePaise: 100000,
        gstBps: 1800,
      },
    ],
    reason: "Travel service invoice",
    taxBasis: "Fictional accountant-reviewed tax treatment",
    reviewed: true as const,
  };
}
async function session(a: any, id: string) {
  let raw = "";
  await inviteCustomer(a, { bookingId: id }, async (_to, _subject, text) => {
    raw = new URL(
      text.split("\n").find((s) => s.startsWith("http"))!,
    ).hash.slice(8);
  });
  const token = await consumeInvitation(raw);
  return { token, raw };
}
test("GST calculation validates checksum, exact line rounding, state split and India financial-year boundary", () => {
  assert.ok(validGstin(supplier.gstin));
  assert.ok(!validGstin(supplier.gstin.slice(0, 14) + "!"));
  const v = input("b");
  assert.equal(calculateDocument(v).cgst, 9000);
  assert.equal(calculateDocument({ ...v, placeOfSupply: "09" }).igst, 18000);
  assert.equal(financialYear("2027-03-31"), "2627");
  assert.equal(financialYear("2027-04-01"), "2728");
  assert.throws(() =>
    calculateDocument({ ...v, supplier: { ...supplier, stateCode: "09" } }),
  );
  assert.throws(() =>
    calculateDocument({
      ...v,
      lines: [{ ...v.lines[0], taxablePaise: 2000000000 }],
    }),
  );
});
test("D1 immutable GST invoices are scoped, idempotent and numbered atomically; credit notes cannot exceed original components", () =>
  scope(async () => {
    const f = await fixture(),
      v = input(f.booking.id),
      doc = await issueDocument(f.a, v);
    assert.match(doc.number, /^I\/\d{4}\/000001$/);
    assert.equal(doc.total, 118000);
    assert.equal((await issueDocument(f.a, v)).id, doc.id);
    await assert.rejects(
      issueDocument(f.a, { ...v, reason: "Different reason" }),
      /reused/,
    );
    await assert.rejects(issueDocument({ ...f.a, agencyId: randomUUID() }, v));
    await assert.rejects(
      binding
        .prepare("UPDATE CommerceDocument SET total=1 WHERE id=?")
        .bind(doc.id)
        .run(),
    );
    const credit = {
      ...v,
      requestId: randomUUID(),
      kind: "CREDIT_NOTE",
      originalId: doc.id,
    };
    const result = await Promise.allSettled([
      issueDocument(f.a, credit),
      issueDocument(f.a, { ...credit, requestId: randomUUID() }),
    ]);
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    await assert.rejects(
      issueDocument(f.a, { ...credit, requestId: randomUUID() }),
    );
  }));
test("D1 last invoice capacity race preserves one number and no over-invoicing", () =>
  scope(async () => {
    const f = await fixture();
    const result = await Promise.allSettled([
      issueDocument(f.a, input(f.booking.id)),
      issueDocument(f.a, input(f.booking.id)),
    ]);
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await binding
        .prepare("SELECT value FROM CommerceSequence WHERE agencyId=?")
        .bind(f.a.agencyId)
        .first<{ value: number }>())!.value,
      1,
    );
  }));
test("Customer portal exchanges one-use email invitations, projects only own booking and revokes sessions on email change or owner action", () =>
  scope(async () => {
    const f = await fixture(),
      other = await fixture();
    await issueDocument(f.a, input(f.booking.id));
    const { token, raw } = await session(f.a, f.booking.id);
    await assert.rejects(consumeInvitation(raw));
    const view = await customerOverview(token);
    assert.equal(view.booking.id, f.booking.id);
    assert.equal(view.booking.packageName, "Maintained snapshot");
    assert.equal(view.documents.length, 1);
    assert.ok(!JSON.stringify(view).includes("PRIVATE LEAD NOTE"));
    assert.ok(!JSON.stringify(view).includes(other.booking.id));
    await db.lead.update({
      where: { id: f.lead.id },
      data: { email: "changed@test.invalid" },
    });
    await assert.rejects(customerOverview(token));
    const s = await session(f.a, f.booking.id);
    await revokeCustomerAccess(f.a, f.booking.id);
    await assert.rejects(portalGrant(s.token));
    await assert.rejects(
      inviteCustomer(other.a, { bookingId: f.booking.id }, async () => {}),
    );
  }));
function config(agencyId: string, mode = "TEST") {
  process.env.COMMERCE_PAYMENTS_ENABLED = "true";
  process.env.COMMERCE_MERCHANTS_JSON = JSON.stringify([
    {
      agencyId,
      mode,
      keyId: "rzp_" + mode.toLowerCase() + "_fixture",
      secret: "fictional-secret-only",
      webhookSecret: "fictional-webhook-secret-32-characters",
      contractVersion: "test-contract",
      approved: true,
    },
  ]);
}
function transport() {
  const orderId = "order_" + randomUUID().replaceAll("-", ""),
    paymentId = "pay_" + randomUUID().replaceAll("-", "");
  let captured = false,
    refunded = 0;
  const orders = new Map<string, any>();
  const fetcher = async (url: any, init: any) => {
    const path = new URL(url).pathname;
    if (init.method === "POST") {
      const v = JSON.parse(init.body);
      orders.set(orderId, { ...v, id: orderId, status: "created" });
      return Response.json(orders.get(orderId));
    }
    if (path.includes("/refunds/"))
      return Response.json({
        id: path.split("/").at(-1),
        payment_id: paymentId,
        amount: refunded,
        status: "processed",
        currency: "INR",
      });
    if (path.includes("/payments/"))
      return Response.json({
        id: paymentId,
        order_id: orderId,
        amount: 118000,
        currency: "INR",
        status: captured ? "captured" : "authorized",
        captured,
        amount_refunded: refunded,
      });
    return Response.json(orders.get(orderId));
  };
  return {
    paymentId,
    fetcher: fetcher as typeof fetch,
    capture: () => {
      captured = true;
    },
    refund: () => {
      refunded = 100;
    },
  };
}
test("Payments default off, require correct merchant mode, verify backend capture and keep TEST money separate from CRM", () =>
  scope(async () => {
    const f = await fixture(),
      s = await session(f.a, f.booking.id);
    delete process.env.COMMERCE_PAYMENTS_ENABLED;
    assert.throws(() => merchant(f.a.agencyId), /not enabled/);
    config(f.a.agencyId);
    const t = transport(),
      requestId = randomUUID();
    const o = await createCustomerOrder(s.token, { requestId }, t.fetcher);
    assert.equal(o.state, "READY");
    assert.equal(
      (await createCustomerOrder(s.token, { requestId }, t.fetcher)).id,
      o.id,
    );
    await assert.rejects(
      reconcileCapturedPayment(f.a.agencyId, t.paymentId, t.fetcher),
      /not captured/,
    );
    await assert.rejects(
      paymentWebhook(f.a.agencyId, new Uint8Array([1]), "bad", t.fetcher),
      /signature/,
    );
    t.capture();
    const raw = new TextEncoder().encode(
      JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: t.paymentId } } },
      }),
    );
    const sig = createHmac("sha256", "fictional-webhook-secret-32-characters")
      .update(raw)
      .digest("hex");
    await paymentWebhook(f.a.agencyId, raw, sig, t.fetcher);
    assert.equal(
      (await reconcileCapturedPayment(f.a.agencyId, t.paymentId, t.fetcher))
        .replayed,
      true,
    );
    assert.equal(
      await db.transaction.count({ where: { bookingId: f.booking.id } }),
      0,
    );
    config(f.a.agencyId, "LIVE");
    delete process.env.COMMERCE_LIVE_PAYMENTS_APPROVED;
    assert.throws(() => merchant(f.a.agencyId), /not approved/);
  }));
test("Isolated mocked LIVE capture posts one real ledger receipt; cancelled/late captures require review without booking changes", () =>
  scope(async () => {
    process.env.COMMERCE_LIVE_PAYMENTS_APPROVED = "true";
    try {
      const f = await fixture(),
        s = await session(f.a, f.booking.id);
      config(f.a.agencyId, "LIVE");
      const t = transport();
      await createCustomerOrder(
        s.token,
        { requestId: randomUUID() },
        t.fetcher,
      );
      t.capture();
      await assert.rejects(
        reconcileCapturedPayment(
          f.a.agencyId,
          t.paymentId,
          t.fetcher,
          "wrong-booking",
        ),
        /does not match/,
      );
      await reconcileCapturedPayment(f.a.agencyId, t.paymentId, t.fetcher);
      await reconcileCapturedPayment(f.a.agencyId, t.paymentId, t.fetcher);
      assert.equal(
        await db.transaction.count({ where: { bookingId: f.booking.id } }),
        1,
      );
      assert.equal((await customerOverview(s.token)).booking.outstanding, 0);
      t.refund();
      const refundId = "rfnd_" + randomUUID().replaceAll("-", "");
      await reconcileProviderRefund(f.a.agencyId, refundId, t.fetcher);
      await reconcileProviderRefund(f.a.agencyId, refundId, t.fetcher);
      assert.equal(
        await db.transaction.count({
          where: { bookingId: f.booking.id, kind: "Refund" },
        }),
        1,
      );
      assert.equal((await customerOverview(s.token)).booking.outstanding, 100);
      const f2 = await fixture(),
        s2 = await session(f2.a, f2.booking.id);
      config(f2.a.agencyId, "LIVE");
      const t2 = transport();
      await createCustomerOrder(
        s2.token,
        { requestId: randomUUID() },
        t2.fetcher,
      );
      await db.booking.update({
        where: { id: f2.booking.id },
        data: { status: "Cancelled" },
      });
      t2.capture();
      const p = await reconcileCapturedPayment(
        f2.a.agencyId,
        t2.paymentId,
        t2.fetcher,
      );
      assert.equal(p.state, "REVIEW");
      assert.equal(
        await db.transaction.count({ where: { bookingId: f2.booking.id } }),
        0,
      );
    } finally {
      delete process.env.COMMERCE_LIVE_PAYMENTS_APPROVED;
      delete process.env.COMMERCE_PAYMENTS_ENABLED;
      delete process.env.COMMERCE_MERCHANTS_JSON;
    }
  }));

function nativeConfig() {
  process.env.NATIVE_ADS_ENABLED = "true";
  process.env.META_APP_ID = "fictional";
  process.env.META_APP_SECRET = "fictional-meta-secret";
  process.env.META_GRAPH_VERSION = "v25.0";
  process.env.INTEGRATION_ACTIVE_KEY = "test";
  process.env.INTEGRATION_ENCRYPTION_KEYS = JSON.stringify({
    test: "12".repeat(32),
  });
}
test("Native D1 ads bind OAuth to owner, encrypt credentials, validate selected account and replace only complete exact spend snapshots", () =>
  scope(async () => {
    nativeConfig();
    const f = await fixture(),
      foreign = await fixture();
    const {
      nativeStart,
      nativeFinish,
      nativeAccounts,
      nativeSelect,
      nativeSync,
      nativeOverview,
      nativeDisconnect,
    } = await import("../src/lib/integrations/native-d1");
    let broken = false;
    const transport = (async (raw: any) => {
      const u = new URL(raw);
      if (u.pathname.endsWith("/oauth/access_token"))
        return Response.json({
          access_token: "fictional-oauth-access-token",
          expires_in: 3600,
        });
      if (u.pathname.endsWith("/me/adaccounts"))
        return Response.json({
          data: [
            {
              id: "act_12345",
              name: "Authorised agency ads",
              currency: "INR",
              timezone_name: "Asia/Kolkata",
            },
          ],
        });
      if (broken) return new Response("upstream failure", { status: 503 });
      const date = JSON.parse(u.searchParams.get("time_range")!).since;
      return Response.json({
        data: [
          {
            date_start: date,
            date_stop: date,
            campaign_id: "c1",
            campaign_name: "Winter",
            adset_id: "a1",
            adset_name: "India",
            spend: "123.45",
            impressions: "9007199254740993",
            clicks: "7",
          },
        ],
      });
    }) as typeof fetch;
    const started = await nativeStart(f.a, "META"),
      state = new URL(started.url).searchParams.get("state")!;
    await assert.rejects(
      nativeFinish(foreign.a, "META", state, "code", transport),
    );
    await nativeFinish(f.a, "META", state, "code", transport);
    await assert.rejects(nativeFinish(f.a, "META", state, "code", transport));
    const pending = (await nativeOverview(f.a)).connections[0];
    assert.ok(
      !JSON.stringify(await nativeOverview(f.a)).includes(
        "fictional-oauth-access-token",
      ),
    );
    assert.equal(
      (await nativeAccounts(f.a, pending.id, transport)).accounts.length,
      1,
    );
    await assert.rejects(nativeSelect(f.a, pending.id, "act_other", transport));
    await nativeSelect(f.a, pending.id, "act_12345", transport);
    await nativeSync(
      f.a,
      f.a.agencyId,
      pending.id,
      "2026-11-20",
      "2026-11-20",
      transport,
    );
    const snapshot = JSON.stringify((await nativeOverview(f.a)).facts);
    assert.ok(snapshot.includes("123450000"));
    assert.ok(snapshot.includes("9007199254740993"));
    broken = true;
    await assert.rejects(
      nativeSync(
        f.a,
        f.a.agencyId,
        pending.id,
        "2026-11-20",
        "2026-11-20",
        transport,
      ),
    );
    assert.equal(JSON.stringify((await nativeOverview(f.a)).facts), snapshot);
    await assert.rejects(
      nativeSync(
        foreign.a,
        f.a.agencyId,
        pending.id,
        "2026-11-20",
        "2026-11-20",
        transport,
      ),
    );
    await nativeDisconnect(f.a, pending.id);
    assert.equal((await nativeOverview(f.a)).connections.length, 0);
  }));
test("Native D1 official WhatsApp verifies business phone, opt-in, template facts, dedupe and signed monotonic delivery", () =>
  scope(async () => {
    nativeConfig();
    process.env.WHATSAPP_PROVISION_APPROVED = "true";
    process.env.WHATSAPP_LIVE_SEND_APPROVED = "true";
    const {
      connectNativeWhatsApp,
      consentNative,
      previewNative,
      sendNative,
      nativeWhatsAppWebhook,
    } = await import("../src/lib/messaging/native-d1");
    const f = await fixture();
    await db.lead.update({
      where: { id: f.lead.id },
      data: { phone: "+919000000001" },
    });
    let sends = 0;
    const transport = (async (raw: any, init: any) => {
      const u = new URL(raw);
      if (u.pathname.endsWith("/phone_numbers"))
        return Response.json({
          data: [{ id: "1234567", display_phone_number: "+919000000000" }],
        });
      if (u.pathname.endsWith("/message_templates"))
        return Response.json({
          data: [
            {
              name: "trip_update",
              language: "en",
              status: "APPROVED",
              category: "UTILITY",
              components: [
                {
                  type: "BODY",
                  text: "Hello {{1}}, your booking {{2}} is available for review.",
                },
              ],
            },
          ],
        });
      sends++;
      return Response.json({ messages: [{ id: "wamid." + f.booking.id }] });
    }) as typeof fetch;
    await connectNativeWhatsApp(
      f.a,
      {
        phoneId: "1234567",
        wabaId: "7654321",
        token: "fictional-business-token",
        authorised: true,
      },
      transport,
    );
    const input = {
      requestId: randomUUID(),
      bookingId: f.booking.id,
      template: "trip_update",
      language: "en",
      slots: ["customer", "bookingId"],
      reviewed: true,
    };
    assert.ok(
      (await previewNative(f.a, input, transport)).text.includes(
        "Portal Customer",
      ),
    );
    await assert.rejects(sendNative(f.a, input, transport));
    assert.equal(sends, 0);
    await consentNative(f.a, {
      bookingId: f.booking.id,
      purpose: "SERVICE",
      optedIn: true,
      evidence: "Fictional explicit test opt-in",
    });
    const sent = await sendNative(f.a, input, transport);
    assert.equal((await sendNative(f.a, input, transport)).replayed, true);
    assert.equal(sends, 1);
    const callback = async (status: string) => {
      const raw = new TextEncoder().encode(
          JSON.stringify({
            entry: [
              {
                changes: [
                  {
                    value: {
                      metadata: { phone_number_id: "1234567" },
                      statuses: [
                        {
                          id: "wamid." + f.booking.id,
                          status,
                          recipient_id: "919000000001",
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
        ),
        sig =
          "sha256=" +
          createHmac("sha256", "fictional-meta-secret")
            .update(raw)
            .digest("hex");
      await nativeWhatsAppWebhook(raw, sig);
    };
    await assert.rejects(nativeWhatsAppWebhook(new Uint8Array([1]), "bad"));
    await callback("read");
    await callback("delivered");
    const stored = await binding
      .prepare("SELECT state FROM NativeWhatsAppOutbox WHERE id=?")
      .bind(sent.id)
      .first<{ state: string }>();
    assert.equal(stored?.state, "READ");
    await consentNative(f.a, {
      bookingId: f.booking.id,
      purpose: "SERVICE",
      optedIn: false,
      evidence: "Fictional customer revocation",
    });
    await assert.rejects(
      sendNative(f.a, { ...input, requestId: randomUUID() }, transport),
    );
  }));
test("Native WhatsApp unknown delivery is never retried and customer phone changes invalidate previous consent", () =>
  scope(async () => {
    nativeConfig();
    process.env.WHATSAPP_PROVISION_APPROVED = "true";
    process.env.WHATSAPP_LIVE_SEND_APPROVED = "true";
    const { connectNativeWhatsApp, consentNative, sendNative } =
      await import("../src/lib/messaging/native-d1");
    const f = await fixture();
    await db.lead.update({
      where: { id: f.lead.id },
      data: { phone: "+919000000002" },
    });
    let sends = 0;
    const transport = (async (raw: any) => {
      const u = new URL(raw);
      if (u.pathname.endsWith("/phone_numbers"))
        return Response.json({
          data: [{ id: "2234567", display_phone_number: "+919000000003" }],
        });
      if (u.pathname.endsWith("/message_templates"))
        return Response.json({
          data: [
            {
              name: "plain_update",
              language: "en",
              status: "APPROVED",
              category: "UTILITY",
              components: [
                {
                  type: "BODY",
                  text: "Please contact your agency for an update.",
                },
              ],
            },
          ],
        });
      sends++;
      throw Error("fictional lost acknowledgement");
    }) as typeof fetch;
    await connectNativeWhatsApp(
      f.a,
      {
        phoneId: "2234567",
        wabaId: "7654321",
        token: "fictional-business-token",
        authorised: true,
      },
      transport,
    );
    await consentNative(f.a, {
      bookingId: f.booking.id,
      purpose: "SERVICE",
      optedIn: true,
      evidence: "Explicit fictional customer opt-in",
    });
    const input = {
      requestId: randomUUID(),
      bookingId: f.booking.id,
      template: "plain_update",
      language: "en",
      slots: [],
      reviewed: true,
    };
    await assert.rejects(sendNative(f.a, input, transport), /uncertain/);
    assert.equal((await sendNative(f.a, input, transport)).state, "UNKNOWN");
    assert.equal(sends, 1);
    await db.lead.update({
      where: { id: f.lead.id },
      data: { phone: "+919000000004" },
    });
    await assert.rejects(
      sendNative(f.a, { ...input, requestId: randomUUID() }, transport),
    );
    assert.equal(sends, 1);
  }));

test("Unknown payment creation cannot create a second order and verified owner reconciliation resumes the original checkout",()=>scope(async()=>{
 const {reconcileOrder}=await import("../src/lib/commerce/payments");const f=await fixture(),s=await session(f.a,f.booking.id);config(f.a.agencyId);const base=transport();let providerOrderId="";
 const lost=(async(url:any,init:any)=>{const response=await base.fetcher(url,init);if(init.method==="POST"){providerOrderId=(await response.json()).id;throw Error("lost acknowledgement");}return response;}) as typeof fetch;
 await assert.rejects(createCustomerOrder(s.token,{requestId:randomUUID()},lost),/uncertain/);await assert.rejects(createCustomerOrder(s.token,{requestId:randomUUID()},base.fetcher),/earlier checkout/);const row=await binding.prepare("SELECT id FROM CommercePaymentOrder WHERE agencyId=?").bind(f.a.agencyId).first<{id:string}>();await reconcileOrder(f.a,{id:row!.id,orderId:providerOrderId},base.fetcher);const resumed=await createCustomerOrder(s.token,{requestId:randomUUID()},base.fetcher);assert.equal(resumed.id,row!.id);assert.equal(resumed.state,"READY");
}));
test("Expired subscriptions retain document visibility and customer-access revocation while new issuance is blocked",()=>scope(async()=>{
 const {commerceOverview}=await import("../src/lib/commerce/documents");const f=await fixture();await issueDocument(f.a,input(f.booking.id));const s=await session(f.a,f.booking.id);await db.agency.update({where:{id:f.a.agencyId},data:{subscriptionExpiresAt:new Date(Date.now()-1000)}});assert.equal((await commerceOverview(f.a)).documents.length,1);await assert.rejects(issueDocument(f.a,input(f.booking.id)),/inactive/);await revokeCustomerAccess(f.a,f.booking.id);await assert.rejects(portalGrant(s.token));
}));
