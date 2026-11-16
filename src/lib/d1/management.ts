import type { D1Database } from "@cloudflare/workers-types";
import type { User, Agency, Invitation } from "@prisma/client";
import { z } from "zod";
import { createHash } from "node:crypto";
import { D1Unit, insertD1, newD1Record, updateD1, encodeD1 } from "./unit";
import { HttpError } from "../http";
import { requireSubscription, limitsFor } from "../subscriptions";
import { verificationRequired } from "../mail";
import { requireOperator } from "../operator-access";
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await fn();
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof HttpError &&
        error.status === 409 &&
        error.message.startsWith("This record changed")
      )
        continue;
      throw error;
    }
}
export async function acceptInvitationD1(
  db: D1Database,
  userId: string,
  token: string,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(400, "Invitation is invalid or expired");
  return retry(async () => {
    const unit = new D1Unit(db),
      digest = createHash("sha256").update(token).digest("hex");
    const invitation = (
        await unit.read<Invitation>("Invitation", '"tokenHash"=?', [digest])
      )[0],
      user = (await unit.read<User>("User", '"id"=?', [userId]))[0];
    if (
      !invitation ||
      !user ||
      user.disabled ||
      user.email.toLowerCase() !== invitation.email ||
      invitation.status !== "Pending" ||
      +invitation.expiresAt <= Date.now()
    )
      throw new HttpError(
        403,
        "Invitation is invalid, expired or does not match your signed-in email",
      );
    if (verificationRequired() && !user.emailVerified)
      throw new HttpError(
        403,
        "Verify your email before accepting the invitation",
      );
    const target = (
      await unit.read<Agency>("Agency", '"id"=?', [invitation.agencyId])
    )[0];
    if (!target || target.demo)
      throw new HttpError(403, "Demo membership cannot be changed");
    requireSubscription(target);
    const active = await unit.count("User", '"agencyId"=? AND disabled=0', [
      target.id,
    ]);
    const pending = await unit.count(
      "Invitation",
      `"agencyId"=? AND status='Pending' AND julianday("expiresAt")>julianday(?)`,
      [target.id, encodeD1(new Date())],
    );
    if (active + pending > limitsFor(target.plan).seats)
      throw new HttpError(409, "Your plan’s team limit has been reached.");
    const previous = user.agencyId;
    if (previous && previous !== target.id) {
      const old = (await unit.read<Agency>("Agency", '"id"=?', [previous]))[0];
      if (!old) throw new HttpError(403, "Workspace unavailable");
      for (const model of [
        "User",
        "Lead",
        "Package",
        "Quote",
        "Booking",
        "Transaction",
        "Spend",
        "Activity",
        "Invitation",
        "ReportingCoverage",
        "IntegrationConnection",
        "IntegrationAuthorization",
        "IntegrationSyncRun",
        "AdDailyMetric",
        "WhatsAppChannel",
        "WhatsAppTemplate",
        "MessagingConsent",
        "MessagingConsentEvent",
        "WhatsAppNotification",
        "MessagingDeliveryEvent",
        "AutomationPolicy",
        "AutomationJob",
        "AutomationAttempt",
      ]) {
        const count = await unit.count(model, '"agencyId"=?', [previous]);
        if (count > (model === "User" ? 1 : 0))
          throw new HttpError(
            409,
            "This account already belongs to a populated agency. Use a separate work email or contact support; no records have been moved.",
          );
      }
    }
    unit.writes.push({
      sql: 'DELETE FROM "TourProgress" WHERE "userId"=?',
      values: [user.id],
    });
    unit.writes.push(
      updateD1("User", user.id, { agencyId: target.id, role: invitation.role }),
      updateD1("Invitation", invitation.id, {
        status: "Accepted",
        acceptedAt: new Date(),
      }),
    );
    if (previous && previous !== target.id)
      unit.writes.push({
        sql: 'DELETE FROM "Agency" WHERE id=?',
        values: [previous],
      });
    unit.writes.push(
      { sql: 'DELETE FROM "Session" WHERE "userId"=?', values: [user.id] },
      insertD1(
        "Activity",
        newD1Record("Activity", {
          agencyId: target.id,
          actor: user.id,
          action: `Invitation accepted: ${user.name}, ${invitation.role}`,
        }),
      ),
    );
    await unit.commit();
    return {
      message:
        "Invitation accepted. Sign in again to open your team workspace.",
    };
  });
}
export async function updateSubscriptionD1(
  db: D1Database,
  operatorId: string,
  input: unknown,
  sessionToken: string,
) {
  return retry(async () => {
    const unit = new D1Unit(db);
    await unit.read("User", '"id"=?', [operatorId]);
    await unit.read("Session", '"token"=?', [sessionToken]);
    await requireOperator(operatorId, sessionToken);
    const v = z
      .object({
        agencyId: z.string().min(1),
        plan: z.enum(["Starter", "Growth", "Professional"]),
        status: z.enum(["Trial", "Active", "Paused", "Cancelled"]),
        days: z.coerce.number().int().min(1).max(366),
      })
      .parse(input);
    const agency = (
      await unit.read<Agency>("Agency", '"id"=?', [v.agencyId])
    )[0];
    if (!agency || agency.demo)
      throw new HttpError(403, "Demo subscription cannot be changed");
    const active = await unit.count("User", '"agencyId"=? AND disabled=0', [
      agency.id,
    ]);
    const pending = await unit.count(
      "Invitation",
      `"agencyId"=? AND status='Pending' AND julianday("expiresAt")>julianday(?)`,
      [agency.id, encodeD1(new Date())],
    );
    if (active + pending > limitsFor(v.plan).seats)
      throw new HttpError(
        409,
        "Disable members or revoke invitations before downgrading.",
      );
    unit.writes.push(
      updateD1("Agency", agency.id, {
        plan: v.plan,
        subscription: v.status,
        subscriptionExpiresAt:
          v.status === "Active"
            ? new Date(Date.now() + v.days * 86400000)
            : null,
      }),
      insertD1(
        "Activity",
        newD1Record("Activity", {
          agencyId: agency.id,
          actor: operatorId,
          action: `Service administrator subscription update: ${v.plan}, ${v.status}${v.status === "Active" ? `, ${v.days} days` : ""}; manual billing`,
        }),
      ),
    );
    await unit.commit();
    return {
      message: "Subscription updated. No payment was collected or processed.",
    };
  });
}
