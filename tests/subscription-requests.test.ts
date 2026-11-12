import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { mutate } from "../src/lib/actions";
import { workspaceData } from "../src/lib/data";
import type { Actor } from "../src/lib/access";
test("expired owners can request renewal without activating access; tenant and role boundaries hold", async () => {
  const k = "billing-" + randomUUID(),
    ids = [k + "a", k + "b"];
  try {
    for (const id of ids) {
      await db.agency.create({
        data: { id, name: "Billing test", subscription: "Cancelled" },
      });
      await db.user.create({
        data: {
          id,
          email: id + "@example.test",
          name: "Owner",
          agencyId: id,
          role: "OWNER",
        },
      });
    }
    const a: Actor = { id: ids[0], agencyId: ids[0], role: "OWNER" },
      b: Actor = { id: ids[1], agencyId: ids[1], role: "OWNER" };
    const input = { plan: "Growth", type: "Renew", agencyId: b.agencyId };
    await mutate(a, "subscription-request", input);
    await mutate(a, "subscription-request", input);
    assert.equal(
      await db.activity.count({ where: { agencyId: a.agencyId } }),
      1,
    );
    assert.equal(
      await db.activity.count({ where: { agencyId: b.agencyId } }),
      0,
    );
    const ag = await db.agency.findUniqueOrThrow({ where: { id: a.agencyId } });
    assert.equal(ag.plan, "Starter");
    assert.equal(ag.subscription, "Cancelled");
    assert.equal(ag.subscriptionExpiresAt, null);
    assert.equal((await workspaceData(a)).billing.requests.length, 1);
    assert.equal((await workspaceData(b)).billing.requests.length, 0);
    await db.user.update({ where: { id: a.id }, data: { role: "AGENT" } });
    await assert.rejects(mutate(a, "subscription-request", input), /owner/i);
    assert.equal(
      (await workspaceData({ ...a, role: "AGENT" })).billing.requests.length,
      0,
    );
    await assert.rejects(
      mutate({ ...b, demo: true }, "subscription-request", input),
      /read-only/,
    );
    await assert.rejects(
      mutate(b, "subscription-request", {
        plan: "Unlimited",
        type: "Activate",
      }),
    );
  } finally {
    await db.activity.deleteMany({ where: { agencyId: { in: ids } } });
    await db.user.deleteMany({ where: { agencyId: { in: ids } } });
    await db.agency.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
