import { workspaceRoleAllowed } from "../access";
import { AUTO_ASSIGNEE, leastOpenAssignee } from "../lead-assignment";
import {
  itineraryQuoteSource,
  itineraryQuoteLink,
} from "../workspace-operations/quote-source";
import type { D1Database } from "@cloudflare/workers-types";
import type {
  Agency,
  User,
  Lead,
  Package,
  Quote,
  Booking,
  Transaction,
  ReportingCoverage,
} from "@prisma/client";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import type { Actor } from "../access";
import { writable, canManage, requireOwner } from "../access";
import { HttpError, trustedOrigin } from "../http";
import { requireMail, sendMail } from "../mail";
import {
  requestPrefix,
  subscriptionRequestSchema,
} from "../subscription-request-format";
import { requireSubscription, limitsFor } from "../subscriptions";
import {
  leadSchema,
  packageSchema,
  amount,
  dateValue,
  taxRate,
} from "../validation";
import { scoreLead } from "../model";
import { quoteTotal, pricedUnit, balances } from "../money";
import {
  timezoneSchema,
  reportingWindow,
  fullCalendarMonths,
  calendarDate,
} from "../reporting-time";
import {
  D1Unit,
  newD1Record,
  insertD1,
  bulkInsertD1,
  updateD1,
  encodeD1,
} from "./unit";
import type { MutationResult } from "../actions";
const id = z.string().min(1).max(100);
const ledgerKinds = [
  "Receipt",
  "Refund",
  "Expense",
  "Supplier payment",
  "Supplier credit",
  "Supplier refund",
] as const;
async function attempt(
  db: D1Database,
  actor: Actor,
  action: string,
  input: unknown,
): Promise<MutationResult> {
  writable(actor);
  const unit = new D1Unit(db);
  const current = (await unit.read<User>("User", '"id"=?', [actor.id]))[0];
  if (
    !current ||
    current.disabled ||
    current.agencyId !== actor.agencyId ||
    !workspaceRoleAllowed(current.role)
  )
    throw new HttpError(403, "Workspace access unavailable");
  const a = { ...actor, role: current.role };
  const agency = (await unit.read<Agency>("Agency", '"id"=?', [a.agencyId]))[0];
  if (!agency || agency.demo)
    throw new HttpError(403, "Demo workspace is read-only");
  if (
    !["settings", "team", "invite-revoke", "subscription-request"].includes(
      action,
    )
  )
    requireSubscription(agency);
  const audit = (message: string, leadId?: string) =>
    unit.writes.push(
      insertD1(
        "Activity",
        newD1Record("Activity", {
          agencyId: a.agencyId,
          actor: a.id,
          action: message,
          leadId: leadId ?? null,
        }),
      ),
    );
  const leadAccess = async (leadId: string) => {
    const rows = await unit.read<Lead>(
      "Lead",
      '"id"=? AND "agencyId"=?' +
        (a.role === "AGENT" ? ' AND "assignedId"=?' : ""),
      [leadId, a.agencyId, ...(a.role === "AGENT" ? [a.id] : [])],
    );
    if (!rows[0])
      throw new HttpError(404, "Enquiry not found or not permitted");
    return rows[0];
  };
  const bookingAccess = async (bookingId: string) => {
    const booking = (
      await unit.read<Booking>("Booking", '"id"=? AND "agencyId"=?', [
        bookingId,
        a.agencyId,
      ])
    )[0];
    if (!booking) throw new HttpError(404, "Booking not found");
    await leadAccess(booking.leadId);
    return booking;
  };
  const finish = async (result: MutationResult) => {
    await unit.commit();
    return result;
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
    const parsed = rows.map((row) => leadSchema.parse(row));
    if (
      action === "import" &&
      parsed.some((row) => ["Won", "Quoted"].includes(row.stage))
    )
      throw new Error(
        "Import new enquiries only; create quotations and bookings in the app",
      );
    const automatic = parsed.some((row) => row.assignedId === AUTO_ASSIGNEE);
    if (automatic) {
      if (a.role === "AGENT")
        throw new HttpError(
          403,
          "Only an owner or manager can automatically assign a new enquiry",
        );
      if (
        action !== "lead" ||
        wrapper.id ||
        parsed.length !== 1 ||
        parsed[0].stage !== "New"
      )
        throw new HttpError(
          400,
          "Automatic assignment is available only for one new enquiry at creation",
        );
      const candidates = await unit.read<User>(
        "User",
        `"agencyId"=? AND NOT "disabled" AND "role" IN ('OWNER','MANAGER','AGENT')`,
        [a.agencyId],
      );
      const workload = [];
      for (const user of candidates)
        workload.push({
          id: user.id,
          open: await unit.count(
            "Lead",
            `"agencyId"=? AND "assignedId"=? AND stage IN ('New','Contacted','Qualified','Quoted')`,
            [a.agencyId, user.id],
          ),
        });
      parsed[0].assignedId = leastOpenAssignee(workload);
    }
    for (const assigned of new Set(parsed.map((row) => row.assignedId))) {
      const user = (
        await unit.read<User>("User", '"id"=? AND "agencyId"=?', [
          assigned,
          a.agencyId,
        ])
      )[0];
      if (!user || user.disabled || (a.role === "AGENT" && assigned !== a.id))
        throw new HttpError(403, "Choose an active permitted teammate");
    }
    if (
      !wrapper.id &&
      (await unit.count("Lead", '"agencyId"=?', [a.agencyId])) + parsed.length >
        limitsFor(agency.plan).leads
    )
      throw new HttpError(409, "Your plan’s enquiry limit has been reached.");
    if (action === "import") {
      const records = parsed.map((row) =>
        newD1Record("Lead", {
          ...row,
          agencyId: a.agencyId,
          ...scoreLead(row),
        }),
      );
      const events = records.map((row) =>
        newD1Record("Activity", {
          agencyId: a.agencyId,
          actor: a.id,
          action: "Enquiry imported",
          leadId: row.id,
        }),
      );
      unit.writes.push(
        bulkInsertD1("Lead", records),
        bulkInsertD1("Activity", events),
      );
      return finish({ message: `${records.length} enquiry record(s) saved` });
    }
    const v = parsed[0];
    if (wrapper.id) {
      const old = await leadAccess(wrapper.id);
      if (v.stage === "Won" && old.stage !== "Won")
        throw new Error("Use an accepted quotation to create a Won booking");
      if (
        old.stage === "Won" &&
        (v.stage !== "Won" ||
          old.travellers !== v.travellers ||
          +old.travelStart !== +v.travelStart ||
          +old.travelEnd !== +v.travelEnd)
      )
        throw new Error(
          "Booked enquiry dates, travellers and Won stage are fixed; manage cancellation in Bookings",
        );
      unit.writes.push(updateD1("Lead", old.id, { ...v, ...scoreLead(v) }));
      audit("Enquiry updated", old.id);
    } else {
      if (v.stage === "Won")
        throw new Error("Create a booking through a quotation to mark Won");
      const record = newD1Record("Lead", {
        ...v,
        agencyId: a.agencyId,
        ...scoreLead(v),
      });
      unit.writes.push(insertD1("Lead", record));
      audit(
        automatic
          ? "Enquiry created · automatically assigned by least-open workload"
          : "Enquiry created",
        String(record.id),
      );
    }
    return finish({ message: `${parsed.length} enquiry record(s) saved` });
  }
  if (action === "package") {
    canManage(a);
    const value = packageSchema.parse(input),
      key = z.object({ id: id.optional() }).parse(input).id;
    if (key) {
      if (
        !(
          await unit.read<Package>("Package", '"id"=? AND "agencyId"=?', [
            key,
            a.agencyId,
          ])
        )[0]
      )
        throw new HttpError(404, "Package not found");
      unit.writes.push(updateD1("Package", key, value));
    } else
      unit.writes.push(
        insertD1(
          "Package",
          newD1Record("Package", { ...value, agencyId: a.agencyId }),
        ),
      );
    return finish({ message: "Package saved" });
  }
  if (action === "followup" || action === "schedule-followup") {
    const v = (
      action === "followup"
        ? z.object({
            id,
            date: z.union([dateValue, z.literal("").transform(() => null)]),
            note: z.string().trim().min(1).max(2000),
          })
        : z.object({ id, date: dateValue })
    ).parse(input);
    const lead = await leadAccess(v.id);
    if (action === "schedule-followup" && ["Won", "Lost"].includes(lead.stage))
      throw new Error("Choose an open enquiry");
    unit.writes.push(updateD1("Lead", lead.id, { followUp: v.date }));
    audit(
      action === "followup"
        ? `Follow-up completed: ${"note" in v ? v.note : ""}`
        : "Internal follow-up scheduled; no message sent",
      lead.id,
    );
    return finish({
      message:
        action === "followup"
          ? "Follow-up completed and recorded"
          : "Follow-up scheduled; no message sent",
    });
  }
  if (action === "approve-quote") {
    const v = z.object({ id }).parse(input),
      quote = (
        await unit.read<Quote>("Quote", '"id"=? AND "agencyId"=?', [
          v.id,
          a.agencyId,
        ])
      )[0];
    if (!quote || quote.status !== "Draft")
      throw new Error("Draft quotation unavailable");
    await leadAccess(quote.leadId);
    unit.writes.push(
      updateD1("Quote", quote.id, {
        status: "Approved",
        approvedAt: new Date(),
        approvedBy: a.id,
      }),
    );
    audit(`Quotation ${quote.id} reviewed and approved`, quote.leadId);
    return finish({ message: "Quotation approved for sharing" });
  }
  if (action === "quote") {
    const v = z
      .object({
        leadId: id,
        packageId: id,
        proposal: z.string().max(12000).default(""),
        itineraryVersionId: id.optional(),
        itineraryReviewed: z.boolean().default(false),
        pricingMode: z
          .enum(["Recorded selling rate", "Cost plus markup", "Target margin"])
          .default("Recorded selling rate"),
        pricingPercent: taxRate.default(0),
        discount: amount,
        tax: taxRate,
      })
      .parse(input);
    const lead = await leadAccess(v.leadId);
    if (["Won", "Lost"].includes(lead.stage))
      throw new Error("Choose an open enquiry");
    const pkg = (
      await unit.read<Package>("Package", '"id"=? AND "agencyId"=?', [
        v.packageId,
        a.agencyId,
      ])
    )[0];
    if (!pkg) throw new HttpError(404, "Package not found");
    if (a.role === "AGENT" && v.pricingMode !== "Recorded selling rate")
      throw new HttpError(
        403,
        "Supplier-cost pricing requires manager permission",
      );
    if (v.itineraryVersionId && !v.itineraryReviewed)
      throw new HttpError(
        400,
        "Review the saved itinerary prices and dates before creating the quotation",
      );
    const snapshot = v.itineraryVersionId
      ? await itineraryQuoteSource(a, v.itineraryVersionId, lead, pkg.id, unit)
      : null;
    if (snapshot?.existingQuoteId)
      return {
        message: "Existing itemized quotation opened",
        leadId: lead.id,
        quoteId: snapshot.existingQuoteId,
      };
    const unitPrice =
      snapshot?.unitPrice ??
      pricedUnit(pkg.estimatedCost, v.pricingMode, v.pricingPercent, pkg.price);
    if (
      unitPrice <= 0 ||
      (!snapshot &&
        v.pricingMode !== "Recorded selling rate" &&
        pkg.estimatedCost <= 0)
    )
      throw new Error("Maintain a positive package rate/cost before quoting.");
    const discount = snapshot?.discount ?? v.discount,
      taxBps = snapshot?.taxBps ?? v.tax;
    const total =
      snapshot?.total ??
      quoteTotal(unitPrice, lead.travellers, discount, taxBps);
    quoteTotal(pkg.estimatedCost, lead.travellers, 0, 0);
    const previous = Number(
      (await db
        .prepare(
          'SELECT COALESCE(MAX(version),0) AS n FROM "Quote" WHERE "agencyId"=? AND "leadId"=?',
        )
        .bind(a.agencyId, lead.id)
        .first<{ n: number }>())!.n,
    );
    unit.guard(
      'SELECT COALESCE(MAX(version),0)=? FROM "Quote" WHERE "agencyId"=? AND "leadId"=?',
      previous,
      a.agencyId,
      lead.id,
    );
    const quote = newD1Record("Quote", {
      agencyId: a.agencyId,
      version: previous + 1,
      proposal: snapshot?.proposal ?? v.proposal,
      paymentTerms: pkg.paymentTerms,
      cancellationTerms: pkg.cancellationTerms,
      leadId: lead.id,
      packageId: pkg.id,
      travellers: lead.travellers,
      unitPrice,
      travelStart: lead.travelStart,
      travelEnd: lead.travelEnd,
      packageName: pkg.name,
      destination: pkg.destination,
      duration: snapshot?.duration ?? pkg.days,
      inclusions: snapshot?.inclusions ?? pkg.inclusions,
      exclusions: snapshot?.exclusions ?? pkg.exclusions,
      discount,
      taxBps,
      total,
      estimatedCost:
        snapshot?.estimatedCost ?? pkg.estimatedCost * lead.travellers,
    });
    if (snapshot)
      unit.writes.push(
        insertD1("Quote", quote),
        itineraryQuoteLink(
          snapshot.versionId,
          a.agencyId,
          lead.id,
          String(quote.id),
        ),
      );
    unit.writes.push(
      ...(!snapshot ? [insertD1("Quote", quote)] : []),
      updateD1("Lead", lead.id, {
        stage: "Quoted",
        quotedPrice: unitPrice,
        ...scoreLead({ ...lead, quotedPrice: unitPrice }),
      }),
    );
    audit(`Quotation ${quote.id} created`, lead.id);
    return finish({
      message: "Quotation created",
      leadId: lead.id,
      quoteId: String(quote.id),
    });
  }
  if (action === "accept") {
    const v = z.object({ id, dueDate: dateValue }).parse(input),
      quote = (
        await unit.read<Quote>("Quote", '"id"=? AND "agencyId"=?', [
          v.id,
          a.agencyId,
        ])
      )[0];
    if (!quote) throw new HttpError(404, "Quotation not found");
    const lead = await leadAccess(quote.leadId);
    if (!["Draft", "Approved"].includes(quote.status))
      throw new Error("Quotation already accepted");
    if (
      (
        await unit.read<Booking>("Booking", '"leadId"=? AND "agencyId"=?', [
          lead.id,
          a.agencyId,
        ])
      ).length
    )
      throw new Error(
        "This enquiry already has a booking. Open the existing booking instead.",
      );
    if (
      quote.travellers !== lead.travellers ||
      +quote.travelStart !== +lead.travelStart ||
      +quote.travelEnd !== +lead.travelEnd
    )
      throw new Error(
        "Enquiry travellers or dates changed. Please build a new quotation.",
      );
    if (lead.stage === "Lost")
      throw new Error("Reopen the enquiry before booking");
    const booking = newD1Record("Booking", {
      agencyId: a.agencyId,
      leadId: lead.id,
      quoteId: quote.id,
      total: quote.total,
      dueDate: v.dueDate,
      travelStart: lead.travelStart,
      travelEnd: lead.travelEnd,
    });
    unit.writes.push(
      updateD1("Quote", quote.id, {
        status: "Accepted",
        approvedAt: quote.approvedAt || new Date(),
        approvedBy: quote.approvedBy || a.id,
      }),
      insertD1("Booking", booking),
      updateD1("Lead", lead.id, { stage: "Won", followUp: null }),
    );
    audit("Quotation accepted and booking confirmed", lead.id);
    return finish({
      message: "Booking created without duplicating the enquiry",
      leadId: lead.id,
      bookingId: String(booking.id),
    });
  }
  if (action === "transaction") {
    const v = z
      .object({
        bookingId: id,
        requestId: z.uuid(),
        kind: z.enum(ledgerKinds),
        amount,
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
    const booking = await bookingAccess(v.bookingId);
    const hash = createHash("sha256").update(JSON.stringify(v)).digest("hex");
    const previous = (
      await unit.read<Transaction>(
        "Transaction",
        '"agencyId"=? AND "requestId"=?',
        [a.agencyId, v.requestId],
      )
    )[0];
    if (previous) {
      if (previous.requestHash !== hash)
        throw new HttpError(
          409,
          "This submission was already used for a different entry. Close the form and start a new entry.",
        );
      return {
        message:
          "This transaction was already recorded. No duplicate was added.",
      };
    }
    const transactions = (
      await db
        .prepare(
          'SELECT kind,SUM(amount) amount FROM "Transaction" WHERE "bookingId"=? AND "agencyId"=? GROUP BY kind',
        )
        .bind(booking.id, a.agencyId)
        .all<{ kind: string; amount: number }>()
    ).results;
    const balance = balances({ ...booking, transactions });
    if (v.kind === "Receipt" && v.amount > balance.customerDue)
      throw new Error(
        "Receipt cannot exceed the current customer balance, including any cancellation fee",
      );
    if (v.kind === "Refund" && v.amount > balance.netCash)
      throw new Error("Refund cannot exceed unrefunded receipts");
    if (
      ["Supplier payment", "Supplier credit", "Supplier refund"].includes(
        v.kind,
      )
    ) {
      const supplierRows = (
        await db
          .prepare(
            'SELECT kind,SUM(amount) amount FROM "Transaction" WHERE "bookingId"=? AND "agencyId"=? AND supplier=? GROUP BY kind',
          )
          .bind(booking.id, a.agencyId, v.supplier)
          .all<{ kind: string; amount: number }>()
      ).results;
      const supplier = balances({ ...booking, transactions: supplierRows });
      const available =
        v.kind === "Supplier credit"
          ? supplier.supplierCost
          : v.kind === "Supplier refund"
            ? Math.max(0, -supplier.supplierDue)
            : Math.max(0, supplier.supplierDue);
      if (v.amount > available)
        throw new Error(
          "Amount exceeds this supplier’s available expense/payment/refund balance",
        );
    }
    unit.writes.push(
      insertD1(
        "Transaction",
        newD1Record("Transaction", {
          ...v,
          requestHash: hash,
          agencyId: a.agencyId,
        }),
      ),
    );
    audit(`${v.kind} recorded: ${v.amount} paise; ${v.memo}`, booking.leadId);
    return finish({ message: "Manual transaction recorded" });
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
    const booking = await bookingAccess(v.id);
    if (booking.status === "Cancelled" && v.status !== "Cancelled")
      throw new Error(
        "Cancellation is final; create a new enquiry for rebooking",
      );
    if (v.cancellationFee > booking.total)
      throw new Error("Retained cancellation fee cannot exceed booked total");
    unit.writes.push(
      updateD1("Booking", booking.id, {
        status: v.status,
        supplierStatus: v.supplierStatus,
        cancellationFee: v.status === "Cancelled" ? v.cancellationFee : 0,
      }),
    );
    audit(`Booking ${v.status}; supplier ${v.supplierStatus}`, booking.leadId);
    return finish({ message: "Booking status updated" });
  }
  if (action === "cost-coverage") {
    canManage(a);
    const v = z
        .object({
          id,
          complete: z.boolean(),
          revision: z.number().int().min(0),
        })
        .parse(input),
      booking = await bookingAccess(v.id);
    if (booking.costRevision !== v.revision)
      throw new Error(
        "Supplier costs changed. Refresh and reconcile before attesting.",
      );
    unit.writes.push(
      updateD1("Booking", booking.id, { directCostsComplete: v.complete }),
    );
    audit(
      `Direct cost completeness ${v.complete ? "attested" : "withdrawn"}`,
      booking.leadId,
    );
    return finish({ message: "Cost completeness updated" });
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
    unit.writes.push({
      sql: 'DELETE FROM "ReportingCoverage" WHERE "agencyId"=? AND kind=\'Advertising\' AND "fromDate"<=? AND "toDate">=? AND (source=\'\' OR source=?)',
      values: [a.agencyId, v.month + "-31", v.month + "-01", v.channel],
    });
    const record = newD1Record("Spend", { ...v, agencyId: a.agencyId });
    const insert = insertD1("Spend", record);
    unit.writes.push({
      ...insert,
      sql:
        insert.sql +
        ' ON CONFLICT ("agencyId",month,kind,channel) DO UPDATE SET amount=excluded.amount,memo=excluded.memo',
    });
    return finish({
      message:
        "Monthly spend saved (replaces the same month, kind and channel)",
    });
  }
  if (action === "ad-coverage") {
    requireOwner(a);
    const v = z
      .object({
        from: z.string(),
        to: z.string(),
        source: z.string().max(100).default(""),
        complete: z.boolean(),
        revision: z.number().int().min(0),
      })
      .parse(input);
    reportingWindow(v.from, v.to, agency.timezone);
    if (!fullCalendarMonths(v.from, v.to))
      throw new Error(
        "Monthly spend coverage requires complete calendar months",
      );
    if (v.complete && v.to >= calendarDate(new Date(), agency.timezone))
      throw new Error(
        "Only closed historical calendar months can be declared complete",
      );
    if (v.revision !== agency.adSpendRevision)
      throw new Error(
        "Advertising data or timezone changed. Refresh before attesting.",
      );
    unit.writes.push({
      sql: 'DELETE FROM "ReportingCoverage" WHERE "agencyId"=? AND "fromDate"=? AND "toDate"=? AND source=? AND timezone=? AND kind=\'Advertising\'',
      values: [a.agencyId, v.from, v.to, v.source, agency.timezone],
    });
    if (v.complete)
      unit.writes.push(
        insertD1(
          "ReportingCoverage",
          newD1Record("ReportingCoverage", {
            agencyId: a.agencyId,
            fromDate: v.from,
            toDate: v.to,
            source: v.source,
            timezone: agency.timezone,
            kind: "Advertising",
            attestedBy: a.id,
          }),
        ),
      );
    audit(
      `Advertising coverage ${v.complete ? "attested" : "withdrawn"}: ${v.from} to ${v.to}; source ${v.source || "all"}`,
    );
    return finish({ message: "Advertising coverage updated" });
  }
  if (action === "settings") {
    requireOwner(a);
    const v = z
      .object({
        timezone: timezoneSchema.optional(),
        name: z.string().trim().min(2).max(100),
        logo: z.union([
          z.literal(""),
          z
            .url()
            .refine(
              (value) => value.startsWith("https://"),
              "Logo must use HTTPS",
            ),
        ]),
        contact: z.string().max(500),
        footer: z.string().max(2000),
      })
      .parse(input);
    unit.writes.push(updateD1("Agency", a.agencyId, v));
    audit("Agency settings updated");
    return finish({ message: "Agency settings saved" });
  }
  if (action === "subscription-request") {
    requireOwner(a);
    const value = subscriptionRequestSchema.parse(input),
      message = requestPrefix + JSON.stringify(value);
    const duplicate = await unit.read(
      "Activity",
      '"agencyId"=? AND "action"=? AND julianday("createdAt")>=julianday(?)',
      [a.agencyId, message, encodeD1(new Date(Date.now() - 86400000))],
    );
    if (!duplicate.length) audit(message);
    return finish({
      message: duplicate.length
        ? "This request was already recorded today. No duplicate was created."
        : "Request recorded for service administrator review. No payment was taken and your subscription has not changed.",
    });
  }
  if (action === "team-create")
    throw new HttpError(
      409,
      "Use an email invitation. Members must choose their own password.",
    );
  if (action === "team") {
    requireOwner(a);
    const value = z
      .object({
        id,
        role: z.enum(["OWNER", "MANAGER", "AGENT"]),
        disabled: z.boolean(),
      })
      .parse(input);
    if (value.id === a.id) throw new Error("You cannot change your own access");
    const user = (
      await unit.read<User>("User", '"id"=? AND "agencyId"=?', [
        value.id,
        a.agencyId,
      ])
    )[0];
    if (!user) throw new HttpError(404, "Team member not found");
    if (user.disabled && !value.disabled) {
      requireSubscription(agency);
      const active = await unit.count("User", '"agencyId"=? AND disabled=0', [
        a.agencyId,
      ]);
      const pending = await unit.count(
        "Invitation",
        `"agencyId"=? AND status='Pending' AND julianday("expiresAt")>julianday(?)`,
        [a.agencyId, encodeD1(new Date())],
      );
      if (active + pending + 1 > limitsFor(agency.plan).seats)
        throw new HttpError(409, "Your plan’s team limit has been reached.");
    }
    unit.writes.push(
      updateD1("User", user.id, { role: value.role, disabled: value.disabled }),
    );
    if (value.disabled)
      unit.writes.push({
        sql: 'DELETE FROM "Session" WHERE "userId"=?',
        values: [user.id],
      });
    audit(
      `Team access updated: ${user.name}, ${value.role}, ${value.disabled ? "disabled" : "active"}`,
    );
    return finish({ message: "Team access saved" });
  }
  if (action === "invite-revoke") {
    requireOwner(a);
    const value = z.object({ id }).parse(input);
    const invitation = (
      await unit.read<{ id: string; status: string }>(
        "Invitation",
        '"id"=? AND "agencyId"=?',
        [value.id, a.agencyId],
      )
    )[0];
    if (!invitation || invitation.status !== "Pending")
      throw new HttpError(404, "Pending invitation not found");
    unit.writes.push(updateD1("Invitation", value.id, { status: "Revoked" }));
    audit("Pending invitation revoked");
    return finish({ message: "Invitation revoked" });
  }
  if (action === "invite") {
    requireOwner(a);
    requireMail();
    const value = z
      .object({
        email: z.email().transform((value) => value.toLowerCase()),
        role: z.enum(["MANAGER", "AGENT"]),
      })
      .parse(input);
    const existing = (
      await unit.read<User>("User", '"email"=?', [value.email])
    )[0];
    if (existing?.agencyId === a.agencyId)
      throw new HttpError(
        409,
        "This person already belongs to your agency. Manage their access instead.",
      );
    const now = encodeD1(new Date());
    const active = await unit.count("User", '"agencyId"=? AND disabled=0', [
      a.agencyId,
    ]);
    const pending = await unit.count(
      "Invitation",
      `"agencyId"=? AND status='Pending' AND julianday("expiresAt")>julianday(?)`,
      [a.agencyId, now],
    );
    if (active + pending + 1 > limitsFor(agency.plan).seats)
      throw new HttpError(409, "Your plan’s team limit has been reached.");
    if (
      (
        await unit.read(
          "Invitation",
          `"agencyId"=? AND email=? AND status='Pending' AND julianday("expiresAt")>julianday(?)`,
          [a.agencyId, value.email, now],
        )
      ).length
    )
      throw new HttpError(
        409,
        "An invitation is already pending. Revoke it before sending a replacement.",
      );
    const token = randomBytes(32).toString("base64url");
    const invitation = newD1Record("Invitation", {
      agencyId: a.agencyId,
      email: value.email,
      role: value.role,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    unit.writes.push(insertD1("Invitation", invitation));
    await unit.commit();
    try {
      await sendMail(
        value.email,
        `Invitation to ${agency.name}`,
        `You have been invited as ${value.role.toLowerCase()} to ${agency.name} on Vashisht TravelOS.\n\nSign in or create an account using this email, then open this one-time link:\n${trustedOrigin()}/join?token=${token}\n\nIt expires in 7 days. Ignore it if unexpected. Do not share this link.`,
      );
    } catch {
      await db
        .prepare(
          `UPDATE "Invitation" SET status='Revoked' WHERE id=? AND status='Pending'`,
        )
        .bind(String(invitation.id))
        .run();
      throw new HttpError(
        503,
        "Invitation email could not be delivered. No active invitation was left. Check email configuration and retry.",
      );
    }
    const event = insertD1(
      "Activity",
      newD1Record("Activity", {
        agencyId: a.agencyId,
        actor: a.id,
        action: `Team invitation sent: ${value.email}, ${value.role}`,
      }),
    );
    await db
      .prepare(event.sql)
      .bind(...(event.values ?? []))
      .run();
    return {
      message:
        "Invitation emailed. The recipient chooses their own password; you never need to share one.",
    };
  }
  // Other domains keep their PostgreSQL implementations until separately ported.
  // Never run a callback transaction on D1 with ignored rollback semantics.
  throw new HttpError(
    503,
    "This operation is not enabled in the D1 staging migration yet.",
  );
}
export async function mutateD1(
  db: D1Database,
  actor: Actor,
  action: string,
  input: unknown,
): Promise<MutationResult> {
  for (let index = 0; ; index++) {
    try {
      return await attempt(db, actor, action, input);
    } catch (error) {
      if (
        index < 2 &&
        error instanceof HttpError &&
        error.status === 409 &&
        error.message.startsWith("This record changed")
      )
        continue;
      throw error;
    }
  }
}
