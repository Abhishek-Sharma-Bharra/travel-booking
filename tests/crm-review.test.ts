import { test } from "node:test";
import assert from "node:assert/strict";
import type { Dataset } from "../src/lib/data";
import {
  crmReview,
  contactKey,
} from "../src/lib/workspace-operations/crm-review";
import {
  proposedAgencyOffers,
  publicOfferVersion,
} from "../src/lib/public-offers";
import { limitsFor } from "../src/lib/subscriptions";
function fixture() {
  const l = {
    agencyId: "a",
    id: "one",
    externalId: "ONE",
    customer: "First",
    email: "shared@test.invalid",
    phone: "+91 (98765) 43210",
    destination: "Delhi",
    stage: "New",
    assignedId: "staff",
    lostReason: "",
    repeatCustomer: false,
    followUp: "2026-11-26T00:00:00Z",
  };
  return {
    agency: { id: "a", timezone: "Asia/Kolkata" },
    actor: { id: "staff", role: "OWNER" },
    users: [
      { id: "staff", name: "Same name" },
      { id: "staff2", name: "Same name" },
    ],
    leads: [
      l,
      {
        ...l,
        id: "two",
        externalId: "TWO",
        customer: "Household",
        email: "SHARED@TEST.INVALID",
        phone: "919876543210",
        stage: "Lost",
        lostReason: "Price",
      },
      {
        ...l,
        id: "three",
        externalId: "THREE",
        phone: "9876543210",
        email: "other@test.invalid",
        stage: "Won",
        assignedId: "staff2",
      },
      {
        ...l,
        id: "four",
        externalId: "FOUR",
        phone: "",
        email: "",
        stage: "Lost",
        lostReason: "price",
      },
      {
        ...l,
        id: "foreign",
        agencyId: "other",
        customer: "Private other tenant",
      },
    ],
    bookings: [
      { agencyId: "a", id: "book", leadId: "three", status: "Confirmed" },
      { agencyId: "other", id: "x", leadId: "one", status: "Confirmed" },
    ],
  } as unknown as Dataset;
}
const now = new Date("2026-11-26T19:00:00Z"); // 27th in agency timezone

test("CRM candidates use conservative contact equality and never merge records or assume country codes", () => {
  const d = fixture(),
    before = JSON.stringify(d),
    r = crmReview(d, now);
  assert.equal(r.today, "2026-11-27");
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.duplicateIds.sort(), ["one", "two"]);
  assert.equal(r.duplicateGroups.length, 2);
  assert.equal(r.overdue, 1);
  assert.equal(r.rows.find((l) => l.id === "one")?.segment, "Prospective"); // foreign booking cannot affect segment
  assert.equal(r.rows.find((l) => l.id === "three")?.segment, "Active booking");
  assert.equal(JSON.stringify(d), before);
  assert.equal(contactKey("phone", "---"), null);
  assert.equal(contactKey("phone", "123 ext 4"), null);
  assert.equal(contactKey("email", "   "), null);
  assert.notEqual(
    contactKey("phone", "+919876543210"),
    contactKey("phone", "9876543210"),
  );
});
test("review uses agent assignment plus tenant scope for all candidates, segments, sources and staff counts", () => {
  const d = fixture();
  d.actor.role = "AGENT";
  const r = crmReview(d, now);
  assert.equal(r.rows.length, 3);
  assert.equal(r.employees.length, 1);
  assert.equal(r.employees[0].enquiries, 3);
  assert.equal(r.employees[0].won, 0);
  assert.equal(r.sources[0].enquiries, 3);
  assert.ok(!JSON.stringify(r).includes("Private other tenant"));
  d.actor.id = "no-assignment";
  const empty = crmReview(d, now);
  assert.equal(empty.rows.length, 0);
  assert.deepEqual(empty.duplicateGroups, []);
  assert.deepEqual(empty.sources, []);
});
test("lost reasons aggregate case only, preserve missing reasons, and terminal leads cannot be overdue", () => {
  const d = fixture();
  d.leads[0].stage = "Lost";
  d.leads[0].lostReason = "";
  d.leads[2].repeatCustomer = true;
  const r = crmReview(d, now);
  assert.equal(r.overdue, 0);
  assert.equal(r.lost, 3);
  assert.deepEqual(
    r.losses.map((x) => [x.reason, x.count]),
    [
      ["Price", 2],
      ["No reason recorded", 1],
    ],
  );
  assert.equal(
    r.rows.find((x) => x.id === "three")?.segment,
    "Recorded repeat",
  );
  assert.equal(
    r.segments.reduce((s, x) => s + x.count, 0),
    4,
  );
  assert.equal(r.employees.length, 2); // same names must not collapse distinct staff IDs
  assert.throws(() => crmReview(d, new Date("invalid")), /date/);
});
test("premium catalogue is a versioned proposal and does not migrate legacy capacity or billing", () => {
  assert.equal(publicOfferVersion, "advanced-erp-proposal-2026-11-27");
  assert.deepEqual(
    proposedAgencyOffers.map((x) => x.price),
    ["2,999", "5,999", "9,999", "19,999"],
  );
  assert.deepEqual(
    proposedAgencyOffers.map((x) => x.annualPrice),
    ["32,999", "64,999", "1,09,999", null],
  );
  assert.ok(proposedAgencyOffers.every((x) => x.upcoming.length > 0));
  assert.deepEqual(limitsFor("Starter"), { seats: 3, leads: 3000 });
  assert.deepEqual(limitsFor("Growth"), { seats: 10, leads: 10000 });
});
