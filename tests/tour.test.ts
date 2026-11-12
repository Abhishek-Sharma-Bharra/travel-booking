import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { readTour, saveTour } from "../src/lib/tour-service";
import { tourSteps } from "../src/lib/tour-steps";
import type { Actor } from "../src/lib/access";
test("tour completion is per authenticated user and role; disabled and foreign users are rejected", async () => {
  const id = "tour-" + randomUUID();
  try {
    await db.agency.create({ data: { id, name: "Tour fixture" } });
    await db.user.create({
      data: {
        id,
        agencyId: id,
        name: "Owner",
        role: "OWNER",
        email: id + "@example.test",
      },
    });
    const a: Actor = { id, agencyId: id, role: "OWNER" };
    assert.equal((await readTour(a)).progress, null);
    await saveTour(a, { step: 1, status: "ACTIVE" });
    assert.equal((await readTour(a)).progress?.step, 1);
    await assert.rejects(saveTour(a, { step: 0, status: "COMPLETE" }), /final/);
    await saveTour(a, {
      step: tourSteps("OWNER").length - 1,
      status: "COMPLETE",
    });
    assert.equal((await readTour(a)).progress?.status, "COMPLETE");
    await assert.rejects(readTour({ ...a, agencyId: "foreign" }));
    await assert.rejects(
      saveTour({ ...a, demo: true }, { step: 0, status: "ACTIVE" }),
    );
    await db.user.update({ where: { id }, data: { role: "AGENT" } });
    assert.equal((await readTour(a)).progress, null);
    assert.ok(!tourSteps("AGENT").some((s) => s.page === "Integrations"));
    await assert.rejects(
      saveTour(a, { step: tourSteps("OWNER").length - 1, status: "COMPLETE" }),
    );
    await saveTour(a, { step: 0, status: "SKIPPED" });
    assert.equal((await readTour(a)).progress?.role, "AGENT");
    await db.user.update({ where: { id }, data: { disabled: true } });
    await assert.rejects(readTour(a));
  } finally {
    await db.user.deleteMany({ where: { agencyId: id } });
    await db.agency.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
