import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyRestoredCounts } from "../src/lib/operator/backup-integrity";
test("restore acceptance rejects missing integration tables, changed rows and unexpected tables", () => {
  const source = {
    Agency: "2",
    Lead: "1500",
    IntegrationConnection: "1",
    AutomationJob: "1",
    TourProgress: "1",
  };
  assert.doesNotThrow(() => verifyRestoredCounts(source, { ...source }));
  assert.throws(
    () => verifyRestoredCounts(source, { ...source, AutomationJob: "0" }),
    /do not match/,
  );
  const missing = { ...source };
  delete (missing as Partial<typeof source>).TourProgress;
  assert.throws(() => verifyRestoredCounts(source, missing), /do not match/);
  assert.throws(
    () => verifyRestoredCounts(source, { ...source, Unexpected: "0" }),
    /do not match/,
  );
});
