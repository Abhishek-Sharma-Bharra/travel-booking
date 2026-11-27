import type { D1Database } from "@cloudflare/workers-types";
import type {
  Agency,
  User,
  Lead,
  Package,
  Quote,
  Booking,
  Transaction,
  Spend,
  Activity,
  Invitation,
} from "@prisma/client";
import { type Actor, workspaceRoleAllowed } from "../access";
import { HttpError } from "../http";
import { D1Unit, d1Record } from "./unit";
import { guardedD1Batch, type D1Statement } from "./atomic";
type Teammate = Pick<User, "id" | "name" | "role" | "disabled"> &
  Partial<Pick<User, "email">>;
type BookingRecord = Booking & { transactions: Transaction[]; quote: Quote };
type Invite = Pick<
  Invitation,
  "id" | "email" | "role" | "status" | "expiresAt"
>;
async function load(binding: D1Database, input: Actor) {
  const unit = new D1Unit(binding);
  let actor = input;
  if (!input.demo) {
    const user = (await unit.read<User>("User", '"id"=?', [input.id]))[0];
    if (
      !user ||
      user.disabled ||
      user.agencyId !== input.agencyId ||
      !workspaceRoleAllowed(user.role)
    )
      throw new HttpError(403, "Workspace access unavailable");
    actor = { ...input, role: user.role };
  }
  const agency = (
    await unit.read<Agency>("Agency", '"id"=?', [actor.agencyId])
  )[0];
  if (!agency || !!agency.demo !== !!actor.demo)
    throw new HttpError(403, "Workspace access unavailable");
  const agent = actor.role === "AGENT",
    owner = actor.role === "OWNER";
  const leadScope = 'l."agencyId"=?' + (agent ? ' AND l."assignedId"=?' : "");
  const values = [actor.agencyId, ...(agent ? [actor.id] : [])];
  const queries: D1Statement[] = [
    {
      sql: `SELECT id,name,role,disabled${owner ? ",email" : ""} FROM "User" WHERE "agencyId"=? ORDER BY name`,
      values: [actor.agencyId],
    },
    {
      sql: `SELECT l.* FROM "Lead" l WHERE ${leadScope} ORDER BY l."enquiryDate" DESC`,
      values,
    },
    {
      sql: 'SELECT * FROM "Package" WHERE "agencyId"=? ORDER BY name',
      values: [actor.agencyId],
    },
    {
      sql: `SELECT q.* FROM "Quote" q JOIN "Lead" l ON l.id=q."leadId" AND l."agencyId"=q."agencyId" WHERE ${leadScope} ORDER BY q."createdAt" DESC`,
      values,
    },
    {
      sql: `SELECT b.* FROM "Booking" b JOIN "Lead" l ON l.id=b."leadId" AND l."agencyId"=b."agencyId" WHERE ${leadScope} ORDER BY b."createdAt" DESC`,
      values,
    },
    {
      sql: `SELECT t.* FROM "Transaction" t JOIN "Booking" b ON b.id=t."bookingId" AND b."agencyId"=t."agencyId" JOIN "Lead" l ON l.id=b."leadId" AND l."agencyId"=b."agencyId" WHERE ${leadScope}`,
      values,
    },
    {
      sql: 'SELECT * FROM "Spend" WHERE "agencyId"=? AND ?=0 ORDER BY month DESC',
      values: [actor.agencyId, agent ? 1 : 0],
    },
    {
      sql: agent
        ? `SELECT a.* FROM "Activity" a JOIN "Lead" l ON l.id=a."leadId" AND l."agencyId"=a."agencyId" WHERE ${leadScope} ORDER BY a."createdAt" DESC`
        : 'SELECT * FROM "Activity" WHERE "agencyId"=? ORDER BY "createdAt" DESC',
      values: agent ? values : [actor.agencyId],
    },
    {
      sql: 'SELECT COUNT(*) AS count FROM "Lead" WHERE "agencyId"=?',
      values: [actor.agencyId],
    },
    {
      sql: 'SELECT id,email,role,status,"expiresAt" FROM "Invitation" WHERE "agencyId"=? AND ?=1 ORDER BY "createdAt" DESC LIMIT 50',
      values: [actor.agencyId, owner ? 1 : 0],
    },
  ];
  const result = await guardedD1Batch(binding, unit.guards, queries);
  const users: Teammate[] = result[0].results.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    role: String(row.role),
    disabled: !!row.disabled,
    ...(owner ? { email: String(row.email) } : {}),
  }));
  const leads = result[1].results.map((row) => d1Record<Lead>("Lead", row));
  const packages = result[2].results.map((row) =>
    d1Record<Package>("Package", row),
  );
  const quotes = result[3].results.map((row) => d1Record<Quote>("Quote", row));
  const quoteMap = new Map(quotes.map((quote) => [quote.id, quote]));
  const transactions = result[5].results.map((row) =>
    d1Record<Transaction>("Transaction", row),
  );
  const transactionsByBooking = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const list = transactionsByBooking.get(transaction.bookingId) ?? [];
    list.push(transaction);
    transactionsByBooking.set(transaction.bookingId, list);
  }
  const bookings: BookingRecord[] = result[4].results.map((row) => {
    const booking = d1Record<Booking>("Booking", row),
      quote = quoteMap.get(booking.quoteId);
    if (!quote)
      throw new HttpError(503, "Booking reference could not be loaded");
    return {
      ...booking,
      quote,
      transactions: transactionsByBooking.get(booking.id) ?? [],
    };
  });
  const spends = result[6].results.map((row) => d1Record<Spend>("Spend", row));
  const activities = result[7].results.map((row) =>
    d1Record<Activity>("Activity", row),
  );
  const count = Number(result[8].results[0].count);
  const invitations: Invite[] = result[9].results.map((row) => {
    const invitation = d1Record<Invitation>("Invitation", row);
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    };
  });
  return {
    actor,
    records: [
      agency,
      users,
      leads,
      packages,
      quotes,
      bookings,
      spends,
      activities,
      count,
      invitations,
    ] as const,
  };
}
export async function workspaceSnapshotD1(binding: D1Database, actor: Actor) {
  for (let attempt = 0; ; attempt++)
    try {
      return await load(binding, actor);
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
