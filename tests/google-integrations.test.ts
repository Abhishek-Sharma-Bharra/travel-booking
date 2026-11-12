import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { db } from "../src/lib/db";
import {
  startAuthorization,
  finishAuthorization,
  selectAdAccount,
  syncAds,
  integrationOverview,
} from "../src/lib/integrations/service";
import { unseal, credentialContext } from "../src/lib/integrations/vault";
import type { Actor } from "../src/lib/access";
test("Google PKCE, authorized manager hierarchy, encrypted refresh and source-native conversions", async () => {
  const keys = [
      "INTEGRATION_ACTIVE_KEY",
      "INTEGRATION_ENCRYPTION_KEYS",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_API_VERSION",
    ],
    old = { ...process.env },
    id = "google-" + randomUUID();
  let challenge = "",
    refreshed = false;
  const transport: typeof fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.hostname === "oauth2.googleapis.com") {
      const body = new URLSearchParams(String(init?.body));
      if (body.get("grant_type") === "authorization_code")
        assert.equal(
          createHash("sha256")
            .update(body.get("code_verifier")!)
            .digest("base64url"),
          challenge,
        );
      else {
        assert.equal(body.get("refresh_token"), "fictional-refresh-token");
        refreshed = true;
      }
      return Response.json({
        access_token: refreshed
          ? "fictional-refreshed-access-token"
          : "fictional-initial-access-token",
        refresh_token: "fictional-refresh-token",
        expires_in: 3600,
      });
    }
    assert.equal(u.hostname, "googleads.googleapis.com");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["developer-token"], "fictional-developer-token");
    if (u.pathname.endsWith("customers:listAccessibleCustomers"))
      return Response.json({ resourceNames: ["customers/111111"] });
    const body = JSON.parse(String(init?.body));
    if (body.query.includes("FROM customer LIMIT"))
      return Response.json({
        results: [
          {
            customer: {
              id: "111111",
              descriptiveName: "Fictional MCC",
              currencyCode: "INR",
              timeZone: "Asia/Kolkata",
              manager: true,
            },
          },
        ],
      });
    if (body.query.includes("FROM customer_client"))
      return Response.json({
        results: [
          {
            customerClient: {
              clientCustomer: "customers/222222",
              descriptiveName: "Fictional client",
              currencyCode: "INR",
              timeZone: "Asia/Kolkata",
            },
          },
        ],
      });
    assert.equal(headers["login-customer-id"], "111111");
    assert.equal(
      headers.Authorization,
      "Bearer fictional-refreshed-access-token",
    );
    return Response.json({
      results: [
        {
          segments: { date: "2026-01-01" },
          campaign: { id: "333333", name: "Fictional Google campaign" },
          metrics: {
            costMicros: "1100001",
            impressions: "200",
            clicks: "8",
            conversions: 1.5,
          },
        },
      ],
    });
  };
  try {
    Object.assign(process.env, {
      INTEGRATION_ACTIVE_KEY: "test",
      INTEGRATION_ENCRYPTION_KEYS: JSON.stringify({ test: "22".repeat(32) }),
      GOOGLE_CLIENT_ID: "fictional-client",
      GOOGLE_CLIENT_SECRET: "fictional-secret",
      GOOGLE_ADS_DEVELOPER_TOKEN: "fictional-developer-token",
      GOOGLE_ADS_API_VERSION: "v99",
    });
    await db.agency.create({ data: { id, name: "Google fixture" } });
    await db.user.create({
      data: {
        id,
        name: "Owner",
        email: id + "@example.test",
        agencyId: id,
        role: "OWNER",
      },
    });
    const a: Actor = { id, agencyId: id, role: "OWNER" };
    const started = await startAuthorization(a, "GOOGLE"),
      url = new URL(started.url);
    challenge = url.searchParams.get("code_challenge")!;
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("access_type"), "offline");
    await finishAuthorization(
      a,
      "GOOGLE",
      url.searchParams.get("state")!,
      "fictional-code",
      transport,
    );
    const pending = await db.integrationConnection.findFirstOrThrow({
      where: { agencyId: id },
    });
    await assert.rejects(
      selectAdAccount(a, pending.id, "999999", transport),
      /not authorized/,
    );
    await selectAdAccount(a, pending.id, "222222", transport);
    const c = await db.integrationConnection.findFirstOrThrow({
      where: { agencyId: id, status: "CONNECTED" },
    });
    assert.ok(!c.credentials.includes("fictional-refresh-token"));
    assert.equal(
      unseal<{ loginCustomerId: string }>(
        c.credentials,
        credentialContext(id, "GOOGLE", c.id),
      ).loginCustomerId,
      "111111",
    );
    await db.integrationConnection.update({
      where: { id: c.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await syncAds(id, c.id, "2026-01-01", "2026-01-01", transport);
    assert.equal(refreshed, true);
    const fact = await db.adDailyMetric.findFirstOrThrow({
      where: { agencyId: id },
    });
    assert.equal(fact.spendMicros, 1100001n);
    assert.equal(fact.providerConversions, "1.5");
    assert.match(fact.conversionDefinition, /not CRM bookings/);
    assert.ok(
      !JSON.stringify(await integrationOverview(a)).includes(
        "fictional-refresh-token",
      ),
    );
  } finally {
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
    await db.integrationAuthorization.deleteMany({ where: { agencyId: id } });
    await db.adDailyMetric.deleteMany({ where: { agencyId: id } });
    await db.integrationSyncRun.deleteMany({ where: { agencyId: id } });
    await db.integrationConnection.deleteMany({ where: { agencyId: id } });
    await db.activity.deleteMany({ where: { agencyId: id } });
    await db.user.deleteMany({ where: { agencyId: id } });
    await db.agency.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
