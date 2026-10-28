import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { mutate } from "../src/lib/actions";
import { workspaceData } from "../src/lib/data";
import { scope, type Actor } from "../src/lib/access";
test("quote versions, snapshots, approval, tasks and cross-agency isolation", async () => {
  const key = "assistant-" + randomUUID();
  const ids = [key + "a", key + "b"];
  try {
    for (const id of ids) {
      await db.agency.create({ data: { id, name: "Assistant test" } });
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
    const l = await db.lead.create({
      data: {
        agencyId: a.agencyId,
        externalId: key,
        customer: "Test",
        destination: "Bali",
        assignedId: a.id,
        travelStart: new Date("2027-12-01"),
        travelEnd: new Date("2027-12-06"),
        travellers: 2,
        budget: 6000000,
        source: "Website",
      },
    });
    const p = await db.package.create({
      data: {
        agencyId: a.agencyId,
        name: "Bali",
        destination: "Bali",
        days: 6,
        inclusions: "Hotel",
        exclusions: "Flights",
        price: 1000000,
        estimatedCost: 800000,
        paymentTerms: "Deposit to be confirmed",
      },
    });
    const input = {
      leadId: l.id,
      packageId: p.id,
      discount: "0",
      tax: "0",
      proposal: "Day 1: Confirm activities.",
    };
    await assert.rejects(mutate(b, "quote", input));
    await mutate(a, "quote", input);
    await db.package.update({
      where: { id: p.id },
      data: { price: 1200000, paymentTerms: "Changed terms" },
    });
    await mutate(a, "quote", input);
    const qs = await db.quote.findMany({
      where: { leadId: l.id },
      orderBy: { version: "asc" },
    });
    assert.deepEqual(
      qs.map((q) => q.version),
      [1, 2],
    );
    assert.equal(qs[0].total, 2000000);
    assert.equal(qs[0].paymentTerms, "Deposit to be confirmed");
    assert.equal(qs[1].total, 2400000);
    await assert.rejects(mutate(b, "approve-quote", { id: qs[0].id }));
    await mutate(a, "approve-quote", { id: qs[0].id });
    assert.equal(
      (await db.quote.findUniqueOrThrow({ where: { id: qs[0].id } })).status,
      "Approved",
    );
    await assert.rejects(
      mutate(b, "schedule-followup", { id: l.id, date: "2027-01-01" }),
    );
    await mutate(a, "schedule-followup", { id: l.id, date: "2027-01-01" });
    assert.equal((await workspaceData(b)).leads.length, 0);
    assert.equal((await workspaceData(b)).quotes.length, 0);
    const agent: Actor = { ...a, id: "other", role: "AGENT" };
    assert.equal(await db.lead.count({ where: scope(agent) }), 0);
    await assert.rejects(
      mutate({ ...a, demo: true }, "quote", input),
      /read-only/,
    );
  } finally {
    await db.activity.deleteMany({ where: { agencyId: { in: ids } } });
    await db.quote.deleteMany({ where: { agencyId: { in: ids } } });
    await db.lead.deleteMany({ where: { agencyId: { in: ids } } });
    await db.package.deleteMany({ where: { agencyId: { in: ids } } });
    await db.user.deleteMany({ where: { agencyId: { in: ids } } });
    await db.agency.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
