import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  authorizeRunner,
  saveAutomation,
  scheduleAutomation,
  claimJob,
  executeClaim,
  enqueueJob,
  automationOverview,
  retryAutomation,
} from "../src/lib/automation/service";
import { seal, credentialContext } from "../src/lib/integrations/vault";
import type { Actor } from "../src/lib/access";
test("durable automation: default off, isolated policy, duplicate scheduling, concurrent leases, fencing, retries and blocking", async () => {
  const envBefore = { ...process.env };
  const id = "jobs-" + randomUUID(),
    secret = process.env.AUTOMATION_RUNNER_SECRET;
  try {
    process.env.AUTOMATION_RUNNER_SECRET =
      "fictional-runner-secret-32-characters-test";
    assert.throws(() => authorizeRunner(null));
    assert.throws(() => authorizeRunner("Bearer wrong"));
    authorizeRunner("Bearer " + process.env.AUTOMATION_RUNNER_SECRET);
    await db.agency.create({ data: { id, name: "Automation fixture" } });
    await db.user.create({
      data: {
        id,
        agencyId: id,
        name: "Owner",
        email: id + "@example.test",
        role: "OWNER",
      },
    });
    const a: Actor = { id, agencyId: id, role: "OWNER" };
    assert.equal((await automationOverview(a)).policy, null);
    await saveAutomation(a, {
      enabled: true,
      ads: false,
      reminders: false,
      notifications: false,
      summaries: false,
      alerts: true,
    });
    await scheduleAutomation();
    await scheduleAutomation();
    assert.equal(await db.automationJob.count({ where: { agencyId: id } }), 1);
    const claims = await Promise.all([claimJob(), claimJob()]);
    assert.equal(claims.filter(Boolean).length, 1);
    const j = claims.find(Boolean)!;
    assert.equal(
      (await executeClaim({ ...j, leaseToken: "obsolete" })).status,
      "STALE",
    );
    assert.equal((await executeClaim(j)).status, "COMPLETE");
    assert.equal(
      (await db.automationJob.findUniqueOrThrow({ where: { id: j.id } }))
        .status,
      "COMPLETE",
    );
    await assert.rejects(retryAutomation({ ...a, agencyId: "foreign" }, j.id));
    const message = await enqueueJob(
      id,
      "WHATSAPP_SEND",
      "no-live",
      { notificationId: "missing" },
      0,
    );
    const claimed = await claimJob();
    assert.equal(claimed?.id, message.id);
    assert.equal((await executeClaim(claimed!)).status, "BLOCKED");
    await assert.rejects(retryAutomation(a, message.id), /reconciliation/);
    const bad = await enqueueJob(
      id,
      "ADS_SYNC",
      "retry",
      { connectionId: "missing", day: "2026-01-01" },
      0,
    );
    // Enable ads without changing policy revision to exercise provider failure classification, not a policy rejection.
    await db.automationPolicy.update({
      where: { agencyId: id },
      data: { ads: true },
    });
    const badClaim = await claimJob();
    assert.equal(badClaim?.id, bad.id);
    await executeClaim(badClaim!);
    const failed = await db.automationJob.findUniqueOrThrow({
      where: { id: bad.id },
    });
    // Missing connection is a permanent authorization error and must block rather than hammer providers.
    assert.equal(failed.status, "BLOCKED");
    Object.assign(process.env, {
      INTEGRATION_ACTIVE_KEY: "test",
      INTEGRATION_ENCRYPTION_KEYS: JSON.stringify({ test: "44".repeat(32) }),
      META_GRAPH_VERSION: "v99.0",
    });
    const connectionId = id + "-ads";
    await db.integrationConnection.create({
      data: {
        id: connectionId,
        agencyId: id,
        provider: "META",
        accountId: "act_123456",
        status: "CONNECTED",
        currency: "INR",
        timezone: "Asia/Kolkata",
        credentials: seal(
          { accessToken: "fictional-token" },
          credentialContext(id, "META", connectionId),
        ),
      },
    });
    const transient = await enqueueJob(
      id,
      "ADS_SYNC",
      "transient",
      { connectionId, day: "2026-01-01" },
      0,
    );
    const busyRun = await db.integrationSyncRun.create({
      data: {
        agencyId: id,
        connectionId,
        fromDate: "2026-01-01",
        toDate: "2026-01-01",
        revision: 0,
        leaseToken: "other-runner",
        leaseUntil: new Date(Date.now() + 60000),
      },
    });
    const busyClaim = await claimJob();
    assert.equal(busyClaim?.id, transient.id);
    assert.equal((await executeClaim(busyClaim!)).status, "QUEUED");
    assert.equal(
      (
        await db.automationJob.findUniqueOrThrow({
          where: { id: transient.id },
        })
      ).errorCode,
      "SYNC_BUSY",
    );
    await db.integrationSyncRun.delete({ where: { id: busyRun.id } });
    await db.automationJob.update({
      where: { id: transient.id },
      data: { failures: 0 },
    });
    let calls = 0;
    for (let i = 0; i < 5; i++) {
      await db.automationJob.update({
        where: { id: transient.id },
        data: { availableAt: new Date(0) },
      });
      const c = await claimJob();
      assert.equal(c?.id, transient.id);
      await executeClaim(c!, async () => {
        calls++;
        return Response.json({ error: { code: 1 } }, { status: 503 });
      });
      const state = await db.automationJob.findUniqueOrThrow({
        where: { id: transient.id },
      });
      assert.equal(state.status, i === 4 ? "DEAD" : "QUEUED");
      if (i < 4) assert.ok(+state.availableAt > Date.now());
    }
    assert.equal(calls, 5);
    await retryAutomation(a, transient.id);
    const leased = await claimJob();
    await db.automationJob.update({
      where: { id: transient.id },
      data: { leaseUntil: new Date(0) },
    });
    const reclaimed = await claimJob();
    assert.notEqual(leased?.leaseToken, reclaimed?.leaseToken);
    assert.equal((await executeClaim(leased!)).status, "STALE");
    await saveAutomation(a, {
      enabled: false,
      ads: false,
      reminders: false,
      notifications: false,
      summaries: false,
      alerts: false,
    });
    const stale = await enqueueJob(id, "INTEGRATION_ALERT", "stale", {}, 0);
    const c = await claimJob();
    assert.equal(c?.id, stale.id);
    assert.equal((await executeClaim(c!)).status, "BLOCKED");
    await db.user.update({ where: { id }, data: { role: "AGENT" } });
    await assert.rejects(automationOverview(a));
  } finally {
    if (secret === undefined) delete process.env.AUTOMATION_RUNNER_SECRET;
    else process.env.AUTOMATION_RUNNER_SECRET = secret;
    for (const k of [
      "INTEGRATION_ACTIVE_KEY",
      "INTEGRATION_ENCRYPTION_KEYS",
      "META_GRAPH_VERSION",
    ]) {
      if (envBefore[k] === undefined) delete process.env[k];
      else process.env[k] = envBefore[k];
    }
    await db.integrationSyncRun.deleteMany({ where: { agencyId: id } });
    await db.integrationConnection.deleteMany({ where: { agencyId: id } });
    await db.automationAttempt.deleteMany({ where: { agencyId: id } });
    await db.automationJob.deleteMany({ where: { agencyId: id } });
    await db.automationPolicy.deleteMany({ where: { agencyId: id } });
    await db.activity.deleteMany({ where: { agencyId: id } });
    await db.user.deleteMany({ where: { agencyId: id } });
    await db.agency.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
