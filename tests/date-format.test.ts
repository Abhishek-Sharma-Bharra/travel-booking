import { test } from "node:test";
import assert from "node:assert/strict";
import { inr, indianDate, indiaToday } from "../src/lib/money";
test("reused formatters keep exact INR output and current India dates across midnight", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.UTC(2026, 10, 12, 18, 29, 59),
  });
  assert.equal(inr(12345678), "₹1,23,456.78");
  assert.equal(indiaToday(), "2026-11-12");
  assert.equal(indianDate(new Date()), "12 Nov 2026");
  t.mock.timers.tick(2000);
  assert.equal(indiaToday(), "2026-11-13");
  assert.equal(indianDate(new Date()), "13 Nov 2026");
  assert.equal(indianDate("invalid"), "Invalid Date");
});
