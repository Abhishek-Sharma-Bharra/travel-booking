import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { nativeAdvertisingTest as test } from "./support/advertising-test";
import { db, d1Binding } from "../src/lib/db";
import {
  d1StartSync,
  d1Checkpoint,
  d1Disconnect,
} from "../src/lib/integrations/d1-advertising";
import type { Actor } from "../src/lib/access";
const fact = {
  day: "2026-01-01",
  campaignId: "campaign",
  campaignName: "Test",
  adSetId: "",
  adSetName: "",
  spendMicros: "2000000",
  impressions: "10",
  clicks: "2",
};
async function fixture() {
  const agency = await db.agency.create({
    data: { name: "Isolated ads fixture" },
  });
  const user = await db.user.create({
    data: {
      id: randomUUID(),
      name: "Owner",
      email: "ads-native@test.invalid",
      agencyId: agency.id,
      role: "OWNER",
    },
  });
  const c = await db.integrationConnection.create({
    data: {
      agencyId: agency.id,
      provider: "META",
      accountId: "act_123",
      credentials: "fictional-encrypted-placeholder-not-used",
      status: "CONNECTED",
      currency: "INR",
      timezone: "Asia/Kolkata",
    },
  });
  return { c, a: { id: user.id, agencyId: agency.id, role: "OWNER" } as Actor };
}
test("sync lease excludes concurrent work, expiry/disconnect prevents stale publication", async () => {
  const { c, a } = await fixture();
  const run = await d1StartSync(c, "2026-01-01", "2026-01-01", "first");
  await assert.rejects(
    d1StartSync(c, "2026-01-01", "2026-01-01", "second"),
    /already running/,
  );
  await db.integrationSyncRun.update({
    where: { id: run.id },
    data: { leaseUntil: new Date(Date.now() - 1000) },
  });
  await assert.rejects(
    d1Checkpoint(c, run, "first", [fact], ""),
    /lease changed/,
  );
  const resumed = await d1StartSync(c, "2026-01-01", "2026-01-01", "second");
  assert.equal(resumed.id, run.id);
  await assert.rejects(
    d1Checkpoint(c, run, "first", [fact], ""),
    /lease changed/,
  );
  await d1Disconnect(a, c.id);
  await assert.rejects(
    d1Checkpoint(c, resumed, "second", [fact], ""),
    /Connection changed/,
  );
  assert.equal(await db.adDailyMetric.count(), 0);
  assert.equal(
    (await db.integrationConnection.findUniqueOrThrow({ where: { id: c.id } }))
      .credentials,
    "",
  );
});
test("native snapshot insertion failure rolls back deletion and completion together", async () => {
  const { c } = await fixture();
  await db.adDailyMetric.create({
    data: {
      ...fact,
      agencyId: c.agencyId,
      connectionId: c.id,
      currency: "INR",
      timezone: "Asia/Kolkata",
      spendMicros: 1000000n,
      impressions: 10n,
      clicks: 1n,
    },
  });
  const run = await d1StartSync(c, "2026-01-01", "2026-01-01", "lease");
  await d1Binding()!
    .prepare(
      "CREATE TRIGGER fail_ad_insert BEFORE INSERT ON \"AdDailyMetric\" BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
    )
    .run();
  await assert.rejects(
    d1Checkpoint(c, run, "lease", [fact], ""),
    /database operation/,
  );
  assert.equal(
    (await db.adDailyMetric.findFirstOrThrow()).spendMicros,
    1000000n,
  );
  assert.equal(
    (await db.integrationSyncRun.findUniqueOrThrow({ where: { id: run.id } }))
      .status,
    "RUNNING",
  );
  await d1Binding()!.prepare("DROP TRIGGER fail_ad_insert").run();
  await d1Checkpoint(c, run, "lease", [fact], "");
  assert.equal(
    (await db.adDailyMetric.findFirstOrThrow()).spendMicros,
    2000000n,
  );
  assert.equal(
    (await db.integrationSyncRun.findUniqueOrThrow({ where: { id: run.id } }))
      .status,
    "COMPLETE",
  );
});
