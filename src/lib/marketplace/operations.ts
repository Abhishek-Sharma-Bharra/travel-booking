import { Unit, own, identity } from "./core";
import { HttpError } from "../http";
import { seasonalBaseline } from "../workspace-operations/baseline";
export async function transportOperations(
  userId: string,
  businessId: string,
  month: string,
) {
  if (process.env.WORKSPACE_OPERATIONS_ENABLED !== "true")
    throw new HttpError(404, "Workspace operations are not enabled");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new HttpError(400, "Select a valid month");
  const u = new Unit();
  await identity(u, userId);
  const b = await own(u, userId, businessId);
  if (!["BUS", "CAR"].includes(b.kind))
    throw new HttpError(400, "Select a bus or car business");
  const from = month + "-01",
    to = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
    )
      .toISOString()
      .slice(0, 10);
  const summary = await u.db
    .prepare(
      "SELECT COUNT(*) AS requests,COALESCE(SUM(CASE WHEN status IN('CONFIRMED','COMPLETED') THEN subtotal-discount-refundedNet ELSE 0 END),0) AS bookedNet,COALESCE(SUM(CASE WHEN paymentStatus IN('EXTERNALLY_VERIFIED','PROVIDER_VERIFIED') THEN total-refundedNet-refundedTax ELSE 0 END),0) AS verifiedCollections,COALESCE(SUM(expense),0) AS expenses,SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed FROM MPBooking WHERE businessId=? AND start>=? AND start<?",
    )
    .bind(b.id, from, to)
    .first<{
      requests: number;
      bookedNet: number;
      verifiedCollections: number;
      expenses: number;
      completed: number;
    }>();
  const fleet = await u.db
    .prepare(
      "SELECT COUNT(*) AS n FROM MPVehicle WHERE businessId=? AND active=1",
    )
    .bind(b.id)
    .first<{ n: number }>();
  const days = (
    await u.db
      .prepare(
        "WITH RECURSIVE dates(day) AS (SELECT ? UNION ALL SELECT date(day,'+1 day') FROM dates WHERE date(day,'+1 day')<?) SELECT day,(SELECT COUNT(*) FROM MPVehicle v WHERE v.businessId=? AND v.active=1 AND EXISTS(SELECT 1 FROM MPBooking r WHERE r.businessId=v.businessId AND r.vehicleId=v.id AND r.status IN('CONFIRMED','COMPLETED') AND r.start<=dates.day AND r.end>dates.day)) AS occupied FROM dates",
      )
      .bind(from, to, b.id)
      .all<{ day: string; occupied: number }>()
  ).results;
  const today = new Date().toISOString().slice(0, 10),
    coverage = [
      b.createdAt.slice(0, 10),
      new Date(Date.now() - 179 * 86400000).toISOString().slice(0, 10),
    ].sort()[1];
  const history = (
    await u.db
      .prepare(
        "SELECT substr(createdAt,1,10) AS day,COUNT(*) AS count FROM MPBooking WHERE businessId=? AND createdAt>=? GROUP BY substr(createdAt,1,10)",
      )
      .bind(b.id, coverage)
      .all<{ day: string; count: number }>()
  ).results;
  return {
    month,
    kind: b.kind,
    businessId: b.id,
    summary,
    fleet: fleet?.n || 0,
    days,
    baseline: seasonalBaseline(history, today, coverage),
    basis:
      "Revenue is recorded net booking value excluding tax and net refunds, for confirmed/completed trips starting in this month. Expenses include all recorded trip expenses in that cohort. Verified collections are separately documented receipts, including tax; reconcile actual bank statements. Utilization counts confirmed full-vehicle reserved days against today's active fleet, not historical fleet size or seat occupancy; blackout days remain in the denominator.",
  };
}
