import { test } from "node:test";
import assert from "node:assert/strict";
import { chartDomain, chartSegments } from "../src/lib/report-chart";
test("report charts distinguish missing data from recorded zero and retain negative values", () => {
  assert.equal(chartDomain([{ values: [null, NaN] }]).available, false);
  assert.equal(chartDomain([{ values: [0, 0] }]).available, true);
  const d = chartDomain([{ values: [-50, 0, null, 100] }]);
  assert.equal(d.min, -50);
  assert.equal(d.max, 100);
  const segments = chartSegments([-50, 0, null, 100], d.min, d.max);
  assert.equal(segments.length, 2);
  assert.deepEqual(
    segments.map((s) => s.map((p) => p.index)),
    [[0, 1], [3]],
  );
  assert.ok(segments.flat().every((p) => p.y >= 32 && p.y <= 210));
});
test("single-point and all-missing charts do not create invented points or connecting segments", () => {
  assert.equal(chartSegments([null, null], 0, 1).length, 0);
  const single = chartSegments([0], 0, 1);
  assert.equal(single.length, 1);
  assert.equal(single[0].length, 1);
  assert.equal(single[0][0].value, 0);
  assert.ok(Number.isFinite(single[0][0].x));
  assert.equal(chartSegments([1, null, 2], 0, 2).length, 2);
});
