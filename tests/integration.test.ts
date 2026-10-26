import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { mutate as serverMutate } from "../src/lib/actions";
const mutate = (a: Actor, action: string, input: unknown) =>
  serverMutate(
    a,
    action,
    action === "transaction"
      ? { ...(input as object), requestId: randomUUID() }
      : input,
  );
import { workspaceData, demoData } from "../src/lib/data";
import { balances } from "../src/lib/money";
import type { Actor } from "../src/lib/access";
const prefix = "test-" + randomUUID();
let a: Actor, b: Actor, agent: Actor;
let packageId: string, leadId: string, bookingId: string;
const leadInput = (externalId = "L1") => ({
  externalId,
  customer: "Test Customer",
  email: "",
  phone: "",
  destination: "Kerala",
  enquiryDate: "2026-01-01",
  travelStart: "2026-03-10",
  travelEnd: "2026-03-15",
  travellers: "2",
  budget: "20000",
  quotedPrice: "21000",
  source: "Website",
  assignedId: a.id,
  stage: "New",
  notes: "Test only",
  lostReason: "",
  followUp: "2026-02-01",
  firstResponseHours: "4",
  repeatCustomer: "false",
  itineraryRequested: "true",
});
before(async () => {
  const agA = await db.agency.create({
      data: { id: prefix + "-a", name: "Test agency A" },
    }),
    agB = await db.agency.create({
      data: { id: prefix + "-b", name: "Test agency B" },
    });
  for (const [suffix, agencyId, role] of [
    ["a", agA.id, "OWNER"],
    ["b", agB.id, "OWNER"],
    ["agent", agA.id, "AGENT"],
  ] as const)
    await db.user.create({
      data: {
        id: prefix + "-" + suffix,
        name: suffix,
        email: prefix + suffix + "@test.invalid",
        agencyId,
        role,
      },
    });
  a = { id: prefix + "-a", agencyId: agA.id, role: "OWNER" };
  b = { id: prefix + "-b", agencyId: agB.id, role: "OWNER" };
  agent = { id: prefix + "-agent", agencyId: agA.id, role: "AGENT" };
});
after(async () => {
  for (const agencyId of [a?.agencyId, b?.agencyId].filter(Boolean)) {
    await db.activity.deleteMany({ where: { agencyId } });
    await db.transaction.deleteMany({ where: { agencyId } });
    await db.booking.deleteMany({ where: { agencyId } });
    await db.quote.deleteMany({ where: { agencyId } });
    await db.lead.deleteMany({ where: { agencyId } });
    await db.package.deleteMany({ where: { agencyId } });
    await db.spend.deleteMany({ where: { agencyId } });
    await db.user.deleteMany({ where: { agencyId } });
    await db.agency.delete({ where: { id: agencyId } });
  }
  await db.$disconnect();
});
test("server workflow, cross-agency and role attacks", async (t) => {
  await t.test(
    "owner creates package and enquiry; client agencyId is ignored",
    async () => {
      await mutate(a, "package", {
        name: "Test Kerala",
        destination: "Kerala",
        days: "5",
        price: "21000",
        estimatedCost: "15000",
        inclusions: "Hotel",
        exclusions: "Flights",
      });
      packageId = (
        await db.package.findFirstOrThrow({ where: { agencyId: a.agencyId } })
      ).id;
      await mutate(a, "lead", {
        lead: { ...leadInput(), agencyId: b.agencyId },
      });
      leadId = (
        await db.lead.findFirstOrThrow({ where: { agencyId: a.agencyId } })
      ).id;
      assert.equal((await workspaceData(b)).leads.length, 0);
      assert.equal((await workspaceData(agent)).leads.length, 0);
    },
  );
  await t.test(
    "forged IDs cannot cross agency or assignment boundaries",
    async () => {
      await assert.rejects(
        mutate(b, "lead", {
          id: leadId,
          lead: { ...leadInput(), assignedId: b.id },
        }),
        /not found|not permitted/,
      );
      await assert.rejects(
        mutate(agent, "followup", { id: leadId, date: "", note: "Attack" }),
        /not found|not permitted/,
      );
      await assert.rejects(
        mutate(b, "quote", { leadId, packageId, discount: "0", tax: "0" }),
        /not found|not permitted/,
      );
      await assert.rejects(
        mutate(a, "lead", { lead: { ...leadInput("BAD"), assignedId: b.id } }),
        /active teammate/,
      );
      await assert.rejects(
        mutate(agent, "package", { name: "bad" }),
        /permission/,
      );
      await assert.rejects(
        mutate(agent, "team", { id: a.id, role: "OWNER", disabled: false }),
        /Only the owner/,
      );
      await assert.rejects(
        mutate(b, "team", { id: a.id, role: "AGENT", disabled: true }),
        /not found/,
      );
      await assert.rejects(
        mutate(b, "package", {
          id: packageId,
          name: "Attack",
          destination: "Bali",
          days: 2,
          price: "1",
          estimatedCost: "1",
          inclusions: "test",
          exclusions: "test",
        }),
        /not found/,
      );
    },
  );
  await t.test(
    "CSV imports validate all rows and reject agency-scoped duplicates atomically",
    async () => {
      await assert.rejects(
        mutate(a, "import", { rows: [leadInput("L2"), leadInput("L1")] }),
      );
      assert.equal(
        await db.lead.count({
          where: { agencyId: a.agencyId, externalId: "L2" },
        }),
        0,
      );
      await assert.rejects(
        mutate(a, "import", {
          rows: [{ ...leadInput("L3"), travelStart: "2026-02-30" }],
        }),
      );
      await mutate(b, "import", {
        rows: [{ ...leadInput("L1"), assignedId: b.id }],
      });
      assert.equal((await workspaceData(b)).leads.length, 1);
    },
  );
  await t.test(
    "quotation total and conversion preserve one lead and snapshot price",
    async () => {
      await mutate(a, "quote", {
        leadId,
        packageId,
        discount: "1000",
        tax: "5",
      });
      const q = await db.quote.findFirstOrThrow({ where: { leadId } });
      assert.equal(q.total, 4305000);
      assert.equal(q.estimatedCost, 3000000);
      await mutate(a, "package", {
        id: packageId,
        name: "Changed package",
        destination: "Bali",
        days: 7,
        price: "25000",
        estimatedCost: "18000",
        inclusions: "New inclusion",
        exclusions: "New exclusion",
      });
      const saved = await db.quote.findUniqueOrThrow({ where: { id: q.id } });
      assert.equal(saved.packageName, "Test Kerala");
      assert.equal(saved.destination, "Kerala");
      assert.equal(saved.inclusions, "Hotel");
      assert.equal(saved.unitPrice, 2100000);
      await assert.rejects(
        mutate(b, "accept", { id: q.id, dueDate: "2026-02-25" }),
        /not found/,
      );
      await mutate(a, "accept", { id: q.id, dueDate: "2026-02-25" });
      bookingId = (await db.booking.findUniqueOrThrow({ where: { leadId } }))
        .id;
      await assert.rejects(
        mutate(a, "accept", { id: q.id, dueDate: "2026-02-25" }),
        /already accepted/,
      );
      assert.equal(
        await db.lead.count({
          where: { agencyId: a.agencyId, externalId: "L1" },
        }),
        1,
      );
      assert.equal(
        (await db.lead.findUniqueOrThrow({ where: { id: leadId } })).stage,
        "Won",
      );
    },
  );
  await t.test(
    "server rejects cross-tenant receipts, overpayments and refunds",
    async () => {
      const entry = {
        bookingId,
        kind: "Receipt",
        amount: "10000",
        supplier: "",
        memo: "Test receipt",
        date: "2026-02-01",
        dueDate: "",
      };
      await assert.rejects(mutate(b, "transaction", entry), /not found/);
      await assert.rejects(mutate(agent, "transaction", entry), /not found/);
      await mutate(a, "transaction", entry);
      await mutate(a, "transaction", { ...entry, amount: "5000" });
      await assert.rejects(
        mutate(a, "transaction", { ...entry, amount: "50000" }),
        /cannot exceed/,
      );
      await assert.rejects(
        mutate(a, "transaction", { ...entry, kind: "Refund", amount: "16000" }),
        /cannot exceed/,
      );
      await mutate(a, "transaction", {
        ...entry,
        kind: "Refund",
        amount: "1000",
        memo: "Partial customer refund",
      });
      await mutate(a, "transaction", {
        ...entry,
        kind: "Expense",
        amount: "30000",
        supplier: "Test supplier",
      });
      await mutate(a, "transaction", {
        ...entry,
        kind: "Supplier payment",
        amount: "10000",
        supplier: "Test supplier",
      });
      await assert.rejects(
        mutate(a, "transaction", {
          ...entry,
          kind: "Supplier payment",
          amount: "1",
          supplier: "Other supplier",
        }),
        /supplier/,
      );
      const bal = balances(
        await db.booking.findUniqueOrThrow({
          where: { id: bookingId },
          include: { transactions: true },
        }),
      );
      assert.equal(bal.netCash, 1400000);
      assert.equal(bal.customerDue, 2905000);
      assert.equal(bal.supplierDue, 2000000);
      assert.equal(bal.contribution, 1305000);
    },
  );
  await t.test(
    "cancellations retain fees and require explicit refunds and credits",
    async () => {
      await mutate(a, "booking", {
        id: bookingId,
        status: "Cancelled",
        supplierStatus: "Pending",
        cancellationFee: "2000",
      });
      const b = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: { transactions: true },
      });
      assert.equal(balances(b).refundable, 1200000);
      assert.equal(balances(b).sales, 200000);
      await assert.rejects(
        mutate(a, "transaction", {
          bookingId,
          kind: "Receipt",
          amount: "1",
          memo: "bad",
          date: "2026-02-02",
        }),
        /cannot exceed/,
      );
    },
  );
  await t.test(
    "demo is isolated and read-only; relationships and balances are coherent",
    async () => {
      const d = await demoData();
      assert.equal(d.leads.length, 1500);
      assert.equal(d.bookings.length, 330);
      assert.ok(!d.leads.some((l) => l.id === leadId));
      for (const b of d.bookings) {
        const l = d.leads.find((l) => l.id === b.leadId)!;
        assert.ok(+l.enquiryDate <= +b.createdAt);
        assert.ok(+b.createdAt <= +b.travelStart);
        assert.equal(balances(b).supplierDue >= 0, true);
        assert.equal(balances(b).netCash >= 0, true);
        assert.equal(b.total, b.quote.total);
      }
      await assert.rejects(
        mutate(
          {
            id: "demo-visitor",
            agencyId: d.agency.id,
            role: "OWNER",
            demo: true,
          },
          "settings",
          {},
        ),
        /read-only/,
      );
    },
  );
});
