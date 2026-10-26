import { createHash } from "node:crypto";
import { inviteMember, revokeInvitation } from "./invitations";
import { requireSubscription, ensureSeat, limitsFor } from "./subscriptions";
import { HttpError } from "./http";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { Actor, scope, canManage, requireOwner, writable } from "./access";
import {
  leadSchema,
  packageSchema,
  amount,
  dateValue,
  taxRate,
} from "./validation";
import { balances, quoteTotal } from "./money";
import { scoreLead } from "./model";
const id = z.string().min(1).max(100);
export async function mutate(a: Actor, action: string, input: unknown) {
  writable(a);
  const agency = await db.agency.findUniqueOrThrow({
    where: { id: a.agencyId },
  });
  if (agency.demo) throw new Error("Demo workspace is read-only");
  const currentUser = await db.user.findUnique({ where: { id: a.id } });
  if (
    !currentUser ||
    currentUser.disabled ||
    currentUser.agencyId !== a.agencyId
  )
    throw new HttpError(403, "Workspace access unavailable");
  a = { ...a, role: currentUser.role };
  if (!["settings", "team", "invite-revoke"].includes(action))
    requireSubscription(agency);
  if (action === "invite") return inviteMember(a, input);
  if (action === "invite-revoke") return revokeInvitation(a, input);
  if (action === "team-create")
    throw new HttpError(
      409,
      "Use an email invitation. Members must choose their own password.",
    );
  const audit = async (
    tx: Prisma.TransactionClient,
    what: string,
    leadId?: string,
  ) =>
    tx.activity.create({
      data: { agencyId: a.agencyId, actor: a.id, action: what, leadId },
    });
  const leadAccess = async (tx: Prisma.TransactionClient, leadId: string) => {
    const l = await tx.lead.findFirst({ where: { id: leadId, ...scope(a) } });
    if (!l) throw new Error("Enquiry not found or not permitted");
    return l;
  };
  const assignee = async (uid: string) => {
    const u = await db.user.findFirst({
      where: { id: uid, agencyId: a.agencyId, disabled: false },
    });
    if (!u) throw new Error("Choose an active teammate");
    if (a.role === "AGENT" && uid !== a.id)
      throw new Error("Agents may assign only to themselves");
  };
  if (action === "lead" || action === "import") {
    const wrapper = z
      .object({
        id: id.optional(),
        rows: z.array(z.unknown()).max(500).optional(),
        lead: z.unknown().optional(),
      })
      .parse(input);
    const rows = action === "import" ? wrapper.rows : [wrapper.lead];
    if (!rows?.length) throw new Error("No enquiries supplied");
    const parsed = rows.map((r) => leadSchema.parse(r));
    if (
      action === "import" &&
      parsed.some((l) => ["Won", "Quoted"].includes(l.stage))
    )
      throw new Error(
        "Import new enquiries only; create quotations and bookings in the app",
      );
    for (const uid of new Set(parsed.map((l) => l.assignedId)))
      await assignee(uid);
    return db.$transaction(
      async (tx) => {
        if (!wrapper.id) {
          const existing = await tx.lead.count({
            where: { agencyId: a.agencyId },
          });
          if (existing + parsed.length > limitsFor(agency.plan).leads)
            throw new HttpError(
              409,
              "Your plan’s enquiry limit has been reached. Contact support before adding more records.",
            );
        }
        if (action === "import") {
          const created = await tx.lead.createManyAndReturn({
            data: parsed.map((l) => ({
              ...l,
              agencyId: a.agencyId,
              ...scoreLead(l),
            })),
            select: { id: true },
          });
          await tx.activity.createMany({
            data: created.map((l) => ({
              agencyId: a.agencyId,
              actor: a.id,
              action: "Enquiry imported",
              leadId: l.id,
            })),
          });
          return { message: `${created.length} enquiry record(s) saved` };
        }
        for (const l of parsed) {
          if (wrapper.id && action === "lead") {
            const old = await leadAccess(tx, wrapper.id);
            if (l.stage === "Won" && old.stage !== "Won")
              throw new Error(
                "Use an accepted quotation to create a Won booking",
              );
            if (
              old.stage === "Won" &&
              (l.stage !== "Won" ||
                old.travellers !== l.travellers ||
                +old.travelStart !== +l.travelStart ||
                +old.travelEnd !== +l.travelEnd)
            )
              throw new Error(
                "Booked enquiry dates, travellers and Won stage are fixed; manage cancellation in Bookings",
              );
            const lead = await tx.lead.update({
              where: { id: old.id },
              data: { ...l, ...scoreLead(l) },
            });
            await audit(tx, "Enquiry updated", lead.id);
          } else {
            if (l.stage === "Won")
              throw new Error(
                "Create a booking through a quotation to mark Won",
              );
            const lead = await tx.lead.create({
              data: { ...l, agencyId: a.agencyId, ...scoreLead(l) },
            });
            await audit(tx, "Enquiry created", lead.id);
          }
        }
        return { message: `${parsed.length} enquiry record(s) saved` };
      },
      { isolationLevel: "Serializable" },
    );
  }
  if (action === "followup") {
    const v = z
      .object({
        id,
        date: z.union([dateValue, z.literal("").transform(() => null)]),
        note: z.string().trim().min(1).max(2000),
      })
      .parse(input);
    return db.$transaction(async (tx) => {
      const l = await leadAccess(tx, v.id);
      await tx.lead.update({ where: { id: l.id }, data: { followUp: v.date } });
      await audit(tx, `Follow-up completed: ${v.note}`, l.id);
      return { message: "Follow-up completed and recorded" };
    });
  }
  if (action === "package") {
    canManage(a);
    const v = packageSchema.parse(input);
    const key = z.object({ id: id.optional() }).parse(input).id;
    if (key) {
      const existing = await db.package.findFirst({
        where: { id: key, agencyId: a.agencyId },
      });
      if (!existing) throw new Error("Package not found");
      await db.package.update({ where: { id: key }, data: v });
    } else await db.package.create({ data: { ...v, agencyId: a.agencyId } });
    return { message: "Package saved" };
  }
  if (action === "quote") {
    const v = z
      .object({
        leadId: id,
        packageId: id,
        discount: amount,
        tax: taxRate,
      })
      .parse(input);
    return db.$transaction(async (tx) => {
      const l = await leadAccess(tx, v.leadId);
      if (["Won", "Lost"].includes(l.stage))
        throw new Error("Choose an open enquiry");
      const p = await tx.package.findFirst({
        where: { id: v.packageId, agencyId: a.agencyId },
      });
      if (!p) throw new Error("Package not found");
      const taxBps = v.tax;
      const total = quoteTotal(p.price, l.travellers, v.discount, taxBps);
      quoteTotal(p.estimatedCost, l.travellers, 0, 0);
      const q = await tx.quote.create({
        data: {
          agencyId: a.agencyId,
          leadId: l.id,
          packageId: p.id,
          travellers: l.travellers,
          unitPrice: p.price,
          travelStart: l.travelStart,
          travelEnd: l.travelEnd,
          packageName: p.name,
          destination: p.destination,
          duration: p.days,
          inclusions: p.inclusions,
          exclusions: p.exclusions,
          discount: v.discount,
          taxBps,
          total,
          estimatedCost: p.estimatedCost * l.travellers,
        },
      });
      await tx.lead.update({
        where: { id: l.id },
        data: {
          stage: "Quoted",
          quotedPrice: p.price,
          ...scoreLead({ ...l, quotedPrice: p.price }),
        },
      });
      await audit(tx, `Quotation ${q.id} created`, l.id);
      return { message: "Quotation created" };
    });
  }
  if (action === "accept") {
    const v = z.object({ id, dueDate: dateValue }).parse(input);
    return db.$transaction(
      async (tx) => {
        const q = await tx.quote.findFirst({
          where: { id: v.id, agencyId: a.agencyId, lead: scope(a) },
        });
        if (!q) throw new Error("Quotation not found");
        if (q.status !== "Draft") throw new Error("Quotation already accepted");
        const l = await leadAccess(tx, q.leadId);
        if (
          q.travellers !== l.travellers ||
          +q.travelStart !== +l.travelStart ||
          +q.travelEnd !== +l.travelEnd
        )
          throw new Error(
            "Enquiry travellers or dates changed. Please build a new quotation.",
          );
        if (l.stage === "Lost")
          throw new Error("Reopen the enquiry before booking");
        await tx.quote.update({
          where: { id: q.id },
          data: { status: "Accepted" },
        });
        await tx.booking.create({
          data: {
            agencyId: a.agencyId,
            leadId: l.id,
            quoteId: q.id,
            total: q.total,
            dueDate: v.dueDate,
            travelStart: l.travelStart,
            travelEnd: l.travelEnd,
          },
        });
        await tx.lead.update({
          where: { id: l.id },
          data: { stage: "Won", followUp: null },
        });
        await audit(tx, "Quotation accepted and booking confirmed", l.id);
        return { message: "Booking created without duplicating the enquiry" };
      },
      { isolationLevel: "Serializable" },
    );
  }
  if (action === "transaction") {
    const v = z
      .object({
        bookingId: id,
        requestId: z.uuid({
          error: "Refresh this page before recording a transaction.",
        }),
        kind: z.enum([
          "Receipt",
          "Refund",
          "Expense",
          "Supplier payment",
          "Supplier credit",
          "Supplier refund",
        ]),
        amount: amount,
        supplier: z.string().trim().max(100).default(""),
        memo: z.string().trim().min(1).max(500),
        date: dateValue,
        dueDate: z
          .union([dateValue, z.literal("").transform(() => null)])
          .default(null),
      })
      .parse(input);
    if (v.amount <= 0) throw new Error("Amount must be greater than zero");
    if (
      [
        "Expense",
        "Supplier payment",
        "Supplier credit",
        "Supplier refund",
      ].includes(v.kind)
    ) {
      canManage(a);
      if (!v.supplier) throw new Error("Supplier name is required");
    }
    const requestHash = createHash("sha256")
      .update(JSON.stringify(v))
      .digest("hex");
    return db.$transaction(
      async (tx) => {
        const b = await tx.booking.findFirst({
          where: { id: v.bookingId, agencyId: a.agencyId, lead: scope(a) },
          include: { transactions: true },
        });
        if (!b) throw new Error("Booking not found");
        const previous = await tx.transaction.findUnique({
          where: {
            agencyId_requestId: {
              agencyId: a.agencyId,
              requestId: v.requestId,
            },
          },
        });
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new HttpError(
              409,
              "This submission was already used for a different entry. Close the form and start a new entry.",
            );
          return {
            message:
              "This transaction was already recorded. No duplicate was added.",
          };
        }
        const bal = balances(b);
        if (v.kind === "Receipt" && v.amount > bal.customerDue)
          throw new Error(
            "Receipt cannot exceed the current customer balance, including any cancellation fee",
          );
        if (v.kind === "Refund" && v.amount > bal.netCash)
          throw new Error("Refund cannot exceed unrefunded receipts");
        if (
          ["Supplier payment", "Supplier credit", "Supplier refund"].includes(
            v.kind,
          )
        ) {
          const sup = balances({
            ...b,
            transactions: b.transactions.filter(
              (t) => t.supplier === v.supplier,
            ),
          });
          const available =
            v.kind === "Supplier credit"
              ? sup.supplierCost
              : v.kind === "Supplier refund"
                ? Math.max(0, -sup.supplierDue)
                : Math.max(0, sup.supplierDue);
          if (v.amount > available)
            throw new Error(
              "Amount exceeds this supplier’s available expense/payment/refund balance",
            );
        }
        await tx.transaction.create({
          data: { ...v, requestHash, agencyId: a.agencyId },
        });
        await audit(
          tx,
          `${v.kind} recorded: ${v.amount} paise; ${v.memo}`,
          b.leadId,
        );
        return { message: "Manual transaction recorded" };
      },
      { isolationLevel: "Serializable" },
    );
  }
  if (action === "booking") {
    const v = z
      .object({
        id,
        status: z.enum(["Confirmed", "Completed", "Cancelled"]),
        supplierStatus: z.enum(["Pending", "Confirmed", "Part confirmed"]),
        cancellationFee: amount,
      })
      .parse(input);
    canManage(a);
    return db.$transaction(
      async (tx) => {
        const b = await tx.booking.findFirst({
          where: { id: v.id, agencyId: a.agencyId, lead: scope(a) },
        });
        if (!b) throw new Error("Booking not found");
        if (b.status === "Cancelled" && v.status !== "Cancelled")
          throw new Error(
            "Cancellation is final; create a new enquiry for rebooking",
          );
        if (v.cancellationFee > b.total)
          throw new Error(
            "Retained cancellation fee cannot exceed booked total",
          );
        await tx.booking.update({
          where: { id: b.id },
          data: {
            status: v.status,
            supplierStatus: v.supplierStatus,
            cancellationFee: v.status === "Cancelled" ? v.cancellationFee : 0,
          },
        });
        await audit(
          tx,
          `Booking ${v.status}; supplier ${v.supplierStatus}`,
          b.leadId,
        );
        return { message: "Booking status updated" };
      },
      { isolationLevel: "Serializable" },
    );
  }
  if (action === "spend") {
    canManage(a);
    const v = z
      .object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        kind: z.enum(["Advertising", "Operating"]),
        channel: z.string().trim().min(2).max(100),
        amount,
        memo: z.string().max(500).default(""),
      })
      .parse(input);
    await db.spend.upsert({
      where: {
        agencyId_month_kind_channel: {
          agencyId: a.agencyId,
          month: v.month,
          kind: v.kind,
          channel: v.channel,
        },
      },
      create: { ...v, agencyId: a.agencyId },
      update: v,
    });
    return {
      message:
        "Monthly spend saved (replaces the same month, kind and channel)",
    };
  }
  if (action === "settings") {
    requireOwner(a);
    const v = z
      .object({
        name: z.string().trim().min(2).max(100),
        logo: z.union([
          z.literal(""),
          z
            .url()
            .refine((u) => u.startsWith("https://"), "Logo must use HTTPS"),
        ]),
        contact: z.string().max(500),
        footer: z.string().max(2000),
      })
      .parse(input);
    await db.$transaction(async (tx) => {
      await tx.agency.update({ where: { id: a.agencyId }, data: v });
      await audit(tx, "Agency settings updated");
    });
    return { message: "Agency settings saved" };
  }
  if (action === "team") {
    requireOwner(a);
    const v = z
      .object({
        id,
        role: z.enum(["OWNER", "MANAGER", "AGENT"]),
        disabled: z.boolean(),
      })
      .parse(input);
    if (v.id === a.id) throw new Error("You cannot change your own access");
    await db.$transaction(async (tx) => {
      const u = await tx.user.findFirst({
        where: { id: v.id, agencyId: a.agencyId },
      });
      if (!u) throw new Error("Team member not found");
      if (u.disabled && !v.disabled) {
        requireSubscription(agency);
        await ensureSeat(tx, agency);
      }
      await tx.user.update({
        where: { id: u.id },
        data: { role: v.role, disabled: v.disabled },
      });
      if (v.disabled) await tx.session.deleteMany({ where: { userId: u.id } });
      await audit(
        tx,
        `Team access updated: ${u.name}, ${v.role}, ${v.disabled ? "disabled" : "active"}`,
      );
    });
    return { message: "Team access saved" };
  }
  throw new Error("Unknown action");
}
