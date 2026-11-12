import { z } from "zod";
import { db } from "./db";
import type { Actor } from "./access";
import { HttpError } from "./http";
import { TOUR_VERSION, tourSteps } from "./tour-steps";
async function current(a: Actor) {
  const u = await db.user.findUnique({
    where: { id: a.id },
    include: { agency: true },
  });
  if (a.demo || !u || u.disabled || u.agencyId !== a.agencyId || u.agency?.demo)
    throw new HttpError(403, "Tour access unavailable");
  return u;
}
export async function readTour(a: Actor) {
  const u = await current(a),
    p = await db.tourProgress.findUnique({ where: { userId: u.id } });
  return {
    version: TOUR_VERSION,
    role: u.role,
    progress: p?.version === TOUR_VERSION && p.role === u.role ? p : null,
  };
}
export async function saveTour(a: Actor, input: unknown) {
  const u = await current(a),
    v = z
      .object({
        step: z
          .number()
          .int()
          .min(0)
          .max(tourSteps(u.role).length - 1),
        status: z.enum(["ACTIVE", "SKIPPED", "COMPLETE"]),
      })
      .parse(input);
  if (v.status === "COMPLETE" && v.step !== tourSteps(u.role).length - 1)
    throw new HttpError(400, "Finish the final tour step");
  return db.tourProgress.upsert({
    where: { userId: u.id },
    create: {
      userId: u.id,
      agencyId: a.agencyId,
      role: u.role,
      version: TOUR_VERSION,
      ...v,
    },
    update: { role: u.role, version: TOUR_VERSION, ...v },
  });
}
