import { subscriptionAccess, limitsFor } from "./subscriptions";
import { mailReady, verificationRequired } from "./mail";
import { db } from "./db";
import { Actor, scope } from "./access";
export async function workspaceData(a: Actor) {
  const leadWhere = scope(a);
  const [agency, users, leads, packages, quotes, bookings, spends, activities] =
    await Promise.all([
      db.agency.findUniqueOrThrow({ where: { id: a.agencyId } }),
      db.user.findMany({
        where: { agencyId: a.agencyId },
        select: {
          id: true,
          name: true,
          role: true,
          disabled: true,
          ...(a.role === "OWNER" ? { email: true } : {}),
        },
        orderBy: { name: "asc" },
      }),
      db.lead.findMany({ where: leadWhere, orderBy: { enquiryDate: "desc" } }),
      db.package.findMany({
        where: { agencyId: a.agencyId },
        orderBy: { name: "asc" },
      }),
      db.quote.findMany({
        where: { agencyId: a.agencyId, lead: leadWhere },
        include: { package: true },
        orderBy: { createdAt: "desc" },
      }),
      db.booking.findMany({
        where: { agencyId: a.agencyId, lead: leadWhere },
        include: { transactions: true, quote: { include: { package: true } } },
        orderBy: { createdAt: "desc" },
      }),
      a.role === "AGENT"
        ? []
        : db.spend.findMany({
            where: { agencyId: a.agencyId },
            orderBy: { month: "desc" },
          }),
      db.activity.findMany({
        where: {
          agencyId: a.agencyId,
          ...(a.role === "AGENT" ? { lead: { is: leadWhere } } : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  return {
    access: {
      canWrite: !a.demo && subscriptionAccess(agency),
      limits: limitsFor(agency.plan),
      emailConfigured: mailReady(),
      emailVerificationRequired: verificationRequired(),
    },
    invitations:
      a.role === "OWNER"
        ? await db.invitation.findMany({
            where: { agencyId: a.agencyId },
            select: {
              id: true,
              email: true,
              role: true,
              status: true,
              expiresAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 50,
          })
        : [],
    agency,
    users,
    leads,
    packages,
    quotes,
    bookings,
    spends,
    activities,
    actor: { id: a.id, role: a.role },
    demo: !!a.demo,
  };
}
type Jsonify<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;
export type Dataset = Jsonify<Awaited<ReturnType<typeof workspaceData>>>;
export async function demoData() {
  const agency = await db.agency.findFirst({ where: { demo: true } });
  if (!agency)
    throw new Error("Demo has not been seeded. Run npm run db:seed.");
  return workspaceData({
    id: "demo-visitor",
    agencyId: agency.id,
    role: "OWNER",
    demo: true,
  });
}
