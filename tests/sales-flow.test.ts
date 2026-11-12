import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingBlockReason } from "../src/lib/sales-flow";
test("sales journey explains stale, closed, unavailable and already-booked enquiries", () => {
  const q = {
      status: "Draft",
      travellers: 2,
      travelStart: "2026-12-01",
      travelEnd: "2026-12-05",
    },
    l = { ...q, stage: "Quoted" };
  assert.equal(bookingBlockReason(q, l, false), null);
  assert.match(bookingBlockReason(q, l, true)!, /already has a booking/);
  assert.match(bookingBlockReason(q, undefined, false)!, /unavailable/);
  assert.match(
    bookingBlockReason(q, { ...l, stage: "Lost" }, false)!,
    /Reopen/,
  );
  assert.match(
    bookingBlockReason(q, { ...l, stage: "Won" }, false)!,
    /already marked Won/,
  );
  assert.match(
    bookingBlockReason(q, { ...l, travellers: 3 }, false)!,
    /changed/,
  );
  assert.match(
    bookingBlockReason(q, { ...l, travelStart: "2026-12-02" }, false)!,
    /changed/,
  );
  assert.match(
    bookingBlockReason(q, { ...l, travelEnd: "2026-12-06" }, false)!,
    /changed/,
  );
  assert.match(
    bookingBlockReason({ ...q, status: "Accepted" }, l, false)!,
    /no longer a draft/,
  );
  assert.equal(
    bookingBlockReason(
      q,
      {
        ...l,
        travelStart: new Date("2026-12-01"),
        travelEnd: new Date("2026-12-05"),
      },
      false,
    ),
    null,
  );
});
