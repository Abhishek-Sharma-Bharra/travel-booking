import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { db } from "../src/lib/db";
import {
  requestResources,
  closeResources,
  type RequestResources,
} from "../src/lib/request-resources";
import {
  itineraryCommand,
  itineraryOverview,
} from "../src/lib/workspace-operations/itineraries";
import {
  itineraryTotals,
  itineraryPayloadSchema,
  type ItineraryPayload,
} from "../src/lib/workspace-operations/itinerary-format";
import { seasonalBaseline } from "../src/lib/workspace-operations/baseline";
import { mutate } from "../src/lib/actions";
import type { Actor } from "../src/lib/access";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "workspace-operations-tests" },
  }),
);
let binding: D1Database, pgUrl: string, pool: Pool;
const databaseName = "test_p2_" + randomUUID().replaceAll("-", "");
const previous = process.env.WORKSPACE_OPERATIONS_ENABLED;
before(async () => {
  process.env.WORKSPACE_OPERATIONS_ENABLED = "true";
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname),
    "Tests require local PostgreSQL",
  );
  pool = new Pool({ connectionString: url.toString() });
  await pool.query(`CREATE DATABASE "${databaseName}"`);
  url.pathname = "/" + databaseName;
  pgUrl = url.toString();
  const local = new Pool({ connectionString: pgUrl });
  try {
    for (const dir of (await readdir("prisma/migrations")).sort()) {
      if (!dir.match(/^\d/)) continue;
      await local.query(
        await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"),
      );
    }
  } finally {
    await local.end();
  }
  binding = await mf.getD1Database("DB");
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const f of (await readdir("cloudflare/d1/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile("cloudflare/d1/migrations/" + f, "utf8"),
      ).map((sql) => binding.prepare(sql)),
    );
});
after(async () => {
  if (previous === undefined) delete process.env.WORKSPACE_OPERATIONS_ENABLED;
  else process.env.WORKSPACE_OPERATIONS_ENABLED = previous;
  await mf.dispose();
  if (pool) {
    await pool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await pool.end();
  }
});
async function scope<T>(engine: "d1" | "postgresql", fn: () => Promise<T>) {
  const r: RequestResources = {
    databaseUrl: engine === "d1" ? "" : pgUrl,
    databaseEngine: engine,
    d1: engine === "d1" ? binding : undefined,
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
const payload: ItineraryPayload = {
  title: "Reviewed Kerala",
  startDate: "2026-12-01",
  endDate: "2026-12-05",
  travellers: 3,
  days: [
    {
      day: 1,
      title: "Arrival",
      notes: "Transfer after supplier confirmation",
      overnight: "Kochi",
    },
  ],
  costs: [
    {
      kind: "Accommodation",
      label: "Reviewed rooms",
      quantity: 2,
      unitCostPaise: 10001,
    },
    { kind: "Transport", label: "Transfer", quantity: 1, unitCostPaise: 9999 },
  ],
  markupBps: 1750,
  discountPaise: 103,
  taxBps: 500,
  inclusions: "Hotel, transfer",
  exclusions: "Flights",
  terms: "Draft terms subject to final source package policy review",
};
test("exact itinerary costing rejects unsafe totals and malformed dates", () => {
  const t = itineraryTotals(payload);
  assert.equal(t.supplierCost, 30001);
  assert.equal(t.selling, 35251);
  assert.equal(t.total, 36905);
  assert.throws(() => itineraryTotals({ ...payload, discountPaise: 100000 }));
  assert.throws(() =>
    itineraryTotals({
      ...payload,
      costs: [{ ...payload.costs[0], unitCostPaise: 2000000000, quantity: 2 }],
    }),
  );
  assert.equal(
    itineraryPayloadSchema.safeParse({ ...payload, startDate: "2026-02-30" })
      .success,
    false,
  );
});
test("baseline excludes future observations and reports limited history without invented confidence", () => {
  const events = Array.from({ length: 90 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
    count: 2,
  }));
  const a = seasonalBaseline(events, "2026-09-28", "2026-07-01"),
    b = seasonalBaseline(
      [...events, { day: "2026-10-01", count: 999999 }],
      "2026-09-28",
      "2026-07-01",
    );
  assert.deepEqual(a, b);
  assert.ok(a.available);
  if (a.available) {
    assert.equal(a.forecasts[0].expected, 14);
    assert.equal(a.oneDayMae, 0);
  }
  assert.equal(
    seasonalBaseline(events, "2026-09-28", "2026-09-01").available,
    false,
  );
  assert.equal(
    seasonalBaseline(events, "2026-09-28", "2026-07-01", false).available,
    false,
  );
});
for (const engine of ["postgresql", "d1"] as const)
  test(`${engine}: itinerary snapshots, tenant isolation, assignment, immutable history and quote idempotency`, async () => {
    const owner: Actor = {
        id: randomUUID(),
        agencyId: randomUUID(),
        role: "OWNER",
      },
      agent: Actor = {
        id: randomUUID(),
        agencyId: owner.agencyId,
        role: "AGENT",
      },
      foreign: Actor = {
        id: randomUUID(),
        agencyId: randomUUID(),
        role: "OWNER",
      };
    let leadId = "",
      packageId = "";
    await scope(engine, async () => {
      for (const a of [owner, foreign])
        await db.agency.create({
          data: {
            id: a.agencyId,
            name: "Isolated Phase 2 test",
            subscription: "Active",
          },
        });
      for (const a of [owner, agent, foreign])
        await db.user.create({
          data: {
            id: a.id,
            agencyId: a.agencyId,
            name: a.role,
            role: a.role as "OWNER" | "AGENT",
            email: a.id + "@test.invalid",
            emailVerified: true,
          },
        });
      const p = await db.package.create({
        data: {
          agencyId: owner.agencyId,
          name: "Source package",
          destination: "Kerala",
          days: 5,
          price: 10000,
          estimatedCost: 5000,
          inclusions: "Hotel",
          exclusions: "Flights",
          paymentTerms: "Deposit under source terms",
          cancellationTerms: "Source cancellation policy",
        },
      });
      packageId = p.id;
      const l = await db.lead.create({
        data: {
          agencyId: owner.agencyId,
          assignedId: agent.id,
          externalId: randomUUID(),
          customer: "Fictional Traveller",
          destination: "Kerala",
          source: "Website",
          enquiryDate: new Date(),
          travelStart: new Date(payload.startDate),
          travelEnd: new Date(payload.endDate),
          travellers: 3,
          budget: 100000,
          quotedPrice: 0,
        },
      });
      leadId = l.id;
    });
    const command = {
      action: "save",
      revision: 0,
      requestId: randomUUID(),
      leadId,
      packageId,
      payload,
    };
    const saved = await scope(engine, () => itineraryCommand(owner, command));
    assert.ok("id" in saved);
    if (!("id" in saved)) throw Error("No itinerary ID");
    const id = saved.id;
    const replay = await scope(engine, () => itineraryCommand(owner, command));
    assert.ok("replayed" in replay && replay.replayed);
    await assert.rejects(
      scope(engine, () =>
        itineraryCommand(owner, {
          ...command,
          payload: { ...payload, title: "Changed request" },
        }),
      ),
      /request key/,
    );
    await assert.rejects(
      scope(engine, () => itineraryOverview(foreign, { id })),
      /not found/,
    );
    assert.deepEqual(
      (await scope(engine, () => itineraryOverview(foreign))).itineraries,
      [],
    );
    const view = await scope(engine, () => itineraryOverview(owner, { id }));
    assert.ok("itinerary" in view);
    if (!view.itinerary || !view.versions) throw Error("Missing detail");
    const versionId = view.versions[0].id;
    assert.equal(view.itinerary.totals.total, itineraryTotals(payload).total);
    const redacted = await scope(engine, () =>
      itineraryOverview(agent, { id }),
    );
    assert.ok("itinerary" in redacted);
    if (redacted.itinerary) {
      assert.deepEqual(redacted.itinerary.payload.costs, []);
      assert.equal("supplierCost" in redacted.itinerary.totals, false);
      assert.equal(redacted.itinerary.canEdit, false);
    }
    await assert.rejects(
      scope(engine, () =>
        itineraryCommand(agent, { ...command, id, requestId: randomUUID() }),
      ),
      /owner or manager/,
    );
    await scope(engine, () =>
      db.lead.update({ where: { id: leadId }, data: { assignedId: owner.id } }),
    );
    await assert.rejects(
      scope(engine, () => itineraryOverview(agent, { id, version: versionId })),
      /not found/,
    );
    const quoteInput = {
      leadId,
      packageId,
      itineraryVersionId: versionId,
      itineraryReviewed: true,
      discount: "0",
      tax: "0",
    };
    await assert.rejects(
      scope(engine, () =>
        mutate(owner, "quote", { ...quoteInput, itineraryReviewed: false }),
      ),
      /Review the saved/,
    );
    const q = await scope(engine, () => mutate(owner, "quote", quoteInput)),
      q2 = await scope(engine, () => mutate(owner, "quote", quoteInput));
    assert.equal(q.quoteId, q2.quoteId);
    await scope(engine, async () => {
      const quote = await db.quote.findUniqueOrThrow({
        where: { id: q.quoteId! },
      });
      assert.equal(quote.total, itineraryTotals(payload).total);
      assert.equal(quote.estimatedCost, itineraryTotals(payload).supplierCost);
      assert.equal(quote.paymentTerms, "Deposit under source terms");
      assert.match(quote.proposal, /Itemized selling/);
      assert.doesNotMatch(quote.proposal, /markup|supplier cost/i);
    });
    const race = await Promise.allSettled([
      scope(engine, () =>
        itineraryCommand(owner, {
          ...command,
          id,
          requestId: randomUUID(),
          payload: { ...payload, title: "Concurrent A" },
        }),
      ),
      scope(engine, () =>
        itineraryCommand(owner, {
          ...command,
          id,
          requestId: randomUUID(),
          payload: { ...payload, title: "Concurrent B" },
        }),
      ),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const historical = await scope(engine, () =>
      itineraryOverview(owner, { id, version: versionId }),
    );
    assert.equal(historical.itinerary?.title, payload.title);
    await assert.rejects(
      scope(engine, () =>
        itineraryCommand(owner, {
          ...command,
          id,
          revision: 1,
          requestId: randomUUID(),
          packageId: null,
        }),
      ),
      /source package is fixed/,
    );
    const latest = await scope(engine, () => itineraryOverview(owner, { id }));
    if (latest.itinerary) assert.equal(latest.itinerary.revision, 1);
    await assert.rejects(
      scope(engine, () => mutate(owner, "quote", quoteInput)),
      /Current itinerary/,
    );
    await scope(engine, async () => {
      if (engine === "d1")
        await assert.rejects(
          binding
            .prepare(
              "UPDATE WorkspaceItineraryVersion SET payload=? WHERE id=?",
            )
            .bind("{}", versionId)
            .run(),
          /immutable/,
        );
      else
        await assert.rejects(
          db.$executeRaw`UPDATE "WorkspaceItineraryVersion" SET payload='{}' WHERE id=${versionId}`,
          /immutable/,
        );
      await db.user.update({
        where: { id: owner.id },
        data: { disabled: true },
      });
    });
    await assert.rejects(
      scope(engine, () => itineraryOverview(owner, { id })),
      /access unavailable/,
    );
  });

test("customer history uses contact matches rather than names and supplier details respect financial permission", async () => {
  const { customerHistory, supplierBalances, departureEvents } =
    await import("../src/lib/workspace-operations/read-models");
  const root = {
    id: "one",
    customer: "Same name",
    email: "first@test.invalid",
    phone: "+919876543210",
    externalId: "A",
    destination: "Kerala",
    createdAt: "2026-11-01T00:00:00Z",
  };
  const data = {
    leads: [
      root,
      {
        ...root,
        id: "two",
        email: "other@test.invalid",
        phone: "+911234567890",
      },
      {
        ...root,
        id: "three",
        customer: "Shared household",
        email: "",
        phone: "+91 98765 43210",
      },
    ],
    quotes: [],
    bookings: [],
    activities: [],
    access: { canViewCosts: false },
  } as unknown as import("../src/lib/data").Dataset;
  assert.deepEqual(
    customerHistory(data, "one")?.related.map((l) => l.id),
    ["one", "three"],
  );
  assert.equal(customerHistory(data, "missing"), null);
  assert.deepEqual(supplierBalances(data), []);
  assert.deepEqual(departureEvents(data, "2026-13"), []);
});

test("occupancy baseline requires continuous coverage and never invents future capacity", async () => {
  const { occupancyPlanning } =
    await import("../src/lib/workspace-operations/occupancy-baseline");
  const asOf = "2026-11-21",
    day = (n: number) =>
      new Date(Date.parse(asOf) + n * 86400000).toISOString().slice(0, 10),
    history = Array.from({ length: 70 }, (_, i) => ({
      day: day(-i),
      allotment: 10,
      booked: 2,
    })),
    future = Array.from({ length: 7 }, (_, i) => ({
      day: day(i + 1),
      allotment: 10,
    }));
  const r = occupancyPlanning(history, future, asOf);
  assert.ok(r.available);
  if (r.available) {
    assert.equal(r.forecasts[0].estimatedOccupancyPercent, 20);
    assert.equal(r.forecasts[1].estimatedOccupancyPercent, null);
  }
  assert.equal(
    occupancyPlanning(history.slice(1), future, asOf).available,
    false,
  );
  assert.equal(
    occupancyPlanning(
      [{ ...history[0], booked: 20 }, ...history.slice(1)],
      future,
      asOf,
    ).available,
    false,
  );
});
