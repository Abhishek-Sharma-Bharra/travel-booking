import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { seal, unseal, credentialContext } from "../src/lib/integrations/vault";
import {
  startAuthorization,
  finishAuthorization,
  selectAdAccount,
  syncAds,
  integrationOverview,
  disconnectAdAccount,
} from "../src/lib/integrations/service";
import { decimalMicros } from "../src/lib/integrations/provider-http";
import type { Actor } from "../src/lib/access";
test("credential vault authenticates tenant/key context and preserves exact spend", () => {
  const old = process.env.INTEGRATION_ENCRYPTION_KEYS,
    active = process.env.INTEGRATION_ACTIVE_KEY;
  try {
    process.env.INTEGRATION_ACTIVE_KEY = "test";
    process.env.INTEGRATION_ENCRYPTION_KEYS = JSON.stringify({
      test: "11".repeat(32),
    });
    const ctx = credentialContext("a", "META", "id"),
      sealed = seal({ token: "fictional-test-token" }, ctx);
    assert.ok(!sealed.includes("fictional-test-token"));
    assert.deepEqual(unseal(sealed, ctx), { token: "fictional-test-token" });
    assert.throws(() => unseal(sealed, credentialContext("b", "META", "id")));
    assert.equal(decimalMicros("1.230001"), "1230001");
    assert.throws(() => decimalMicros("1e6"));
  } finally {
    if (old) process.env.INTEGRATION_ENCRYPTION_KEYS = old;
    else delete process.env.INTEGRATION_ENCRYPTION_KEYS;
    if (active) process.env.INTEGRATION_ACTIVE_KEY = active;
    else delete process.env.INTEGRATION_ACTIVE_KEY;
  }
});
test("Meta OAuth, authorized account selection, atomic paginated snapshots, retries and tenant denial", async () => {
  const env = { ...process.env },
    prefix = "meta-" + randomUUID(),
    ids = [prefix + "a", prefix + "b"];
  let fail = false,
    expired = false,
    corrected = false;
  const transport: typeof fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, "graph.facebook.com");
    if (u.pathname.endsWith("/oauth/access_token")) {
      assert.equal(init?.method, "POST");
      assert.equal(u.search, "");
      assert.ok(new URLSearchParams(String(init?.body)).has("client_secret"));
      return Response.json({
        access_token: "fictional-meta-test-token",
        expires_in: 3600,
      });
    }
    if (u.pathname.endsWith("/me/adaccounts"))
      return Response.json({
        data: [
          {
            id: "act_123",
            name: "Fictional ads",
            currency: "USD",
            timezone_name: "America/New_York",
          },
        ],
      });
    if (expired)
      return Response.json({ error: { code: 190 } }, { status: 400 });
    if (fail && u.searchParams.get("after"))
      return Response.json({ error: {} }, { status: 503 });
    const second = !!u.searchParams.get("after");
    return Response.json({
      data: [
        {
          date_start: second ? "2026-01-02" : "2026-01-01",
          date_stop: second ? "2026-01-02" : "2026-01-01",
          campaign_id: "c1",
          campaign_name: "Fictional campaign",
          adset_id: "s1",
          adset_name: "Fictional set",
          spend: second ? "0.30" : corrected ? "2.20" : "1.20",
          impressions: "100",
          clicks: "5",
        },
      ],
      ...(!second
        ? {
            paging: {
              next: "https://untrusted.invalid/",
              cursors: { after: "page2" },
            },
          }
        : {}),
    });
  };
  try {
    Object.assign(process.env, {
      INTEGRATION_ACTIVE_KEY: "test",
      INTEGRATION_ENCRYPTION_KEYS: JSON.stringify({ test: "11".repeat(32) }),
      META_APP_ID: "fictional-app",
      META_APP_SECRET: "fictional-secret",
      META_GRAPH_VERSION: "v99.0",
    });
    for (const id of ids) {
      await db.agency.create({ data: { id, name: "Integration fixture" } });
      await db.user.create({
        data: {
          id,
          name: "Owner",
          email: id + "@example.test",
          agencyId: id,
          role: "OWNER",
        },
      });
    }
    const a: Actor = { id: ids[0], agencyId: ids[0], role: "OWNER" },
      b: Actor = { id: ids[1], agencyId: ids[1], role: "OWNER" };
    const started = await startAuthorization(a, "META"),
      state = new URL(started.url).searchParams.get("state")!;
    await assert.rejects(
      finishAuthorization(b, "META", state, "test-code", transport),
      /expired/,
    );
    await finishAuthorization(a, "META", state, "test-code", transport);
    await assert.rejects(
      finishAuthorization(a, "META", state, "test-code", transport),
      /expired/,
    );
    const pending = await db.integrationConnection.findFirstOrThrow({
      where: { agencyId: a.agencyId },
    });
    assert.ok(!pending.credentials.includes("fictional-meta-test-token"));
    await assert.rejects(
      selectAdAccount(b, pending.id, "act_123", transport),
      /unavailable/,
    );
    await assert.rejects(
      selectAdAccount(a, pending.id, "act_999", transport),
      /not authorized/,
    );
    await selectAdAccount(a, pending.id, "act_123", transport);
    const c = await db.integrationConnection.findFirstOrThrow({
      where: { agencyId: a.agencyId, status: "CONNECTED" },
    });
    await syncAds(a.agencyId, c.id, "2026-01-01", "2026-01-02", transport);
    let facts = await db.adDailyMetric.findMany({
      where: { agencyId: a.agencyId },
      orderBy: { day: "asc" },
    });
    assert.equal(facts.length, 2);
    assert.equal(facts[0].spendMicros, 1200000n);
    assert.equal(facts[0].currency, "USD");
    assert.equal(facts[0].timezone, "America/New_York");
    corrected = true;
    await syncAds(a.agencyId, c.id, "2026-01-01", "2026-01-02", transport);
    assert.equal(
      await db.adDailyMetric.count({ where: { agencyId: a.agencyId } }),
      2,
    );
    assert.equal(
      (
        await db.adDailyMetric.findFirstOrThrow({
          where: { agencyId: a.agencyId, day: "2026-01-01" },
        })
      ).spendMicros,
      2200000n,
    );
    fail = true;
    await assert.rejects(
      syncAds(a.agencyId, c.id, "2026-01-01", "2026-01-02", transport),
      /PROVIDER_UNAVAILABLE/,
    );
    assert.equal(
      (
        await db.adDailyMetric.findFirstOrThrow({
          where: { agencyId: a.agencyId, day: "2026-01-01" },
        })
      ).spendMicros,
      2200000n,
    );
    fail = false;
    assert.equal((await integrationOverview(b)).connections.length, 0);
    assert.ok(
      !JSON.stringify(await integrationOverview(a)).includes("credentials"),
    );
    await assert.rejects(
      startAuthorization({ ...a, demo: true }, "META"),
      /read-only/,
    );
    await db.user.update({ where: { id: a.id }, data: { role: "AGENT" } });
    await assert.rejects(startAuthorization(a, "META"), /owner/);
    await db.user.update({ where: { id: a.id }, data: { role: "OWNER" } });
    expired = true;
    await assert.rejects(
      syncAds(a.agencyId, c.id, "2026-01-01", "2026-01-02", transport),
      /NEEDS_REAUTH/,
    );
    assert.equal(
      (
        await db.integrationConnection.findUniqueOrThrow({
          where: { id: c.id },
        })
      ).status,
      "NEEDS_REAUTH",
    );
    await db.agency.update({
      where: { id: a.agencyId },
      data: { subscription: "Cancelled" },
    });
    await disconnectAdAccount(a, c.id);
    assert.equal(
      (
        await db.integrationConnection.findUniqueOrThrow({
          where: { id: c.id },
        })
      ).credentials,
      "",
    );
  } finally {
    for (const k of [
      "INTEGRATION_ACTIVE_KEY",
      "INTEGRATION_ENCRYPTION_KEYS",
      "META_APP_ID",
      "META_APP_SECRET",
      "META_GRAPH_VERSION",
    ]) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    await db.integrationAuthorization.deleteMany({
      where: { agencyId: { in: ids } },
    });
    await db.adDailyMetric.deleteMany({ where: { agencyId: { in: ids } } });
    await db.integrationSyncRun.deleteMany({
      where: { agencyId: { in: ids } },
    });
    await db.integrationConnection.deleteMany({
      where: { agencyId: { in: ids } },
    });
    await db.activity.deleteMany({ where: { agencyId: { in: ids } } });
    await db.user.deleteMany({ where: { agencyId: { in: ids } } });
    await db.agency.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
