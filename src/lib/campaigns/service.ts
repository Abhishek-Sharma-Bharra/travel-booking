import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Agency, User, Package, Prisma } from "@prisma/client";
import type { D1Database } from "@cloudflare/workers-types";
import { db, d1Binding } from "../db";
import type { Actor } from "../access";
import { HttpError, trustedOrigin } from "../http";
import { requireSubscription, limitsFor } from "../subscriptions";
import { startOfLocalDay } from "../reporting-time";
import { verificationRequired } from "../mail";
import { indiaToday } from "../money";
import { D1Unit, newD1Record, insertD1 } from "../d1/unit";
import type { D1Statement, D1Value } from "../d1/atomic";
import {
  publishSchema,
  requestSchema,
  offerSchema,
  priceSummary,
  type PublicCampaign,
} from "./contracts";
import { z } from "zod";
type Campaign = {
  id: string;
  agencyId: string;
  ownerId: string;
  slug: string;
  title: string;
  snapshot: string;
  taxBps: number;
  revision: number;
  enabled: number;
  expiresAt: string;
  createdAt: string;
};
function pgSql(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
async function query<T>(
  sql: string,
  values: D1Value[] = [],
  client: Prisma.TransactionClient = db,
  binding = d1Binding(),
): Promise<T[]> {
  return binding
    ? ((
        await binding
          .prepare(sql)
          .bind(...values)
          .all()
      ).results as T[])
    : client.$queryRawUnsafe<T[]>(pgSql(sql), ...values);
}
class Store {
  unit?: D1Unit;
  constructor(
    readonly client: Prisma.TransactionClient,
    binding?: D1Database,
  ) {
    if (binding) this.unit = new D1Unit(binding);
  }
  read<T>(
    model: "User" | "Agency" | "Package",
    where: string,
    values: D1Value[],
  ): Promise<T[]> {
    return this.unit
      ? this.unit.read<T>(model, where, values)
      : query<T>(
          `SELECT * FROM "${model}" WHERE ${where}`,
          values,
          this.client,
          undefined,
        );
  }
  rows<T>(sql: string, values: D1Value[] = []) {
    return query<T>(sql, values, this.client, this.unit?.db);
  }
  async write(s: D1Statement) {
    if (this.unit) this.unit.writes.push(s);
    else await this.client.$executeRawUnsafe(pgSql(s.sql), ...(s.values ?? []));
  }
  guard(sql: string, ...values: D1Value[]) {
    this.unit?.guard(sql, ...values);
  }
}
async function transaction<T>(
  agencyId: string,
  work: (store: Store) => Promise<T>,
): Promise<T> {
  const binding = d1Binding();
  if (!binding)
    return db.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Agency" WHERE id=$1 FOR UPDATE',
          agencyId,
        );
        return work(new Store(tx));
      },
      { isolationLevel: "Serializable" },
    );
  for (let attempt = 0; ; attempt++) {
    const store = new Store(db, binding);
    try {
      const value = await work(store);
      await store.unit!.commit();
      return value;
    } catch (e) {
      if (
        attempt < 2 &&
        e instanceof HttpError &&
        e.status === 409 &&
        e.message.startsWith("This record changed")
      )
        continue;
      throw e;
    }
  }
}
async function owner(store: Store, input: Actor) {
  const u = (await store.read<User>("User", '"id"=?', [input.id]))[0];
  const a = (await store.read<Agency>("Agency", '"id"=?', [input.agencyId]))[0];
  if (
    !u ||
    u.disabled ||
    (verificationRequired() && !u.emailVerified) ||
    u.agencyId !== input.agencyId ||
    u.role !== "OWNER" ||
    !a ||
    a.demo ||
    input.demo
  )
    throw new HttpError(
      403,
      "Only the active agency owner can manage public campaigns.",
    );
  requireSubscription(a);
  return { user: u, agency: a };
}
const missing = () =>
  new HttpError(404, "This agency campaign is unavailable or has expired.");
async function campaignBySlug(slug: string, store?: Store) {
  if (!/^[a-f0-9]{32}$/.test(slug)) throw missing();
  const rows = store
    ? await store.rows<Campaign>('SELECT * FROM "SalesCampaign" WHERE slug=?', [
        slug,
      ])
    : await query<Campaign>('SELECT * FROM "SalesCampaign" WHERE slug=?', [
        slug,
      ]);
  const c = rows[0];
  if (!c || !Number(c.enabled) || c.expiresAt <= new Date().toISOString())
    throw missing();
  store?.guard(
    'SELECT COUNT(*)=1 FROM "SalesCampaign" WHERE id=? AND revision=? AND enabled=1 AND "expiresAt">?',
    c.id,
    c.revision,
    new Date().toISOString(),
  );
  return c;
}
export async function getPublicCampaign(slug: string): Promise<PublicCampaign> {
  const c = await campaignBySlug(slug);
  const agency = await db.agency.findUnique({ where: { id: c.agencyId } }),
    user = await db.user.findUnique({ where: { id: c.ownerId } });
  if (
    !agency ||
    agency.demo ||
    !user ||
    user.disabled ||
    (verificationRequired() && !user.emailVerified) ||
    user.role !== "OWNER" ||
    user.agencyId !== agency.id
  )
    throw missing();
  try {
    requireSubscription(agency);
  } catch {
    throw missing();
  }
  return {
    slug: c.slug,
    title: c.title,
    agency: agency.name,
    revision: c.revision,
    expiresAt: c.expiresAt,
    taxBps: c.taxBps,
    offers: z.array(offerSchema).min(1).max(12).parse(JSON.parse(c.snapshot)),
    aiAvailable: !!process.env.AI_API_KEY,
    timezone: agency.timezone,
  };
}
export async function listCampaigns(input: Actor) {
  const store = new Store(db, d1Binding());
  await owner(store, input);
  const rows = await store.rows<Campaign & { requests: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM "PublicBookingRequest" r WHERE r."campaignId"=c.id AND r."agencyId"=c."agencyId") AS requests FROM "SalesCampaign" c WHERE c."agencyId"=? ORDER BY c."createdAt" DESC LIMIT 100`,
    [input.agencyId],
  );
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    enabled: !!c.enabled,
    expiresAt: c.expiresAt,
    requests: Number(c.requests),
    url: `${trustedOrigin()}/trips/${c.slug}`,
  }));
}
export async function publishCampaign(input: Actor, raw: unknown) {
  const v = publishSchema.parse(raw);
  if (+v.expiresOn > Date.now() + 90 * 86400000)
    throw new HttpError(400, "Choose an expiry within the next 90 days.");
  return transaction(input.agencyId, async (store) => {
    const { agency } = await owner(store, input);
    const expiresAt = startOfLocalDay(
      new Date(+v.expiresOn + 86400000).toISOString().slice(0, 10),
      agency.timezone,
    ).toISOString();
    if (expiresAt <= new Date().toISOString())
      throw new HttpError(400, "Choose an expiry within the next 90 days.");
    const count = Number(
      (
        await store.rows<{ n: number }>(
          'SELECT COUNT(*) AS n FROM "SalesCampaign" WHERE "agencyId"=? AND enabled=1',
          [input.agencyId],
        )
      )[0].n,
    );
    if (count >= 20)
      throw new HttpError(
        409,
        "Pause an existing campaign before publishing another (20 active links maximum).",
      );
    store.guard(
      'SELECT COUNT(*)=? FROM "SalesCampaign" WHERE "agencyId"=? AND enabled=1',
      count,
      input.agencyId,
    );
    const offers = [];
    for (const id of v.packageIds) {
      const pkg = (
        await store.read<Package>("Package", '"id"=? AND "agencyId"=?', [
          id,
          input.agencyId,
        ])
      )[0];
      if (!pkg)
        throw new HttpError(404, "Choose packages from your own agency.");
      if (
        !pkg.itinerary.trim() ||
        !pkg.paymentTerms.trim() ||
        !pkg.cancellationTerms.trim() ||
        pkg.price <= 0
      )
        throw new HttpError(
          400,
          `Complete itinerary, payment and cancellation terms and selling price for ${pkg.name} before publishing.`,
        );
      const offer = offerSchema.parse(pkg);
      priceSummary(offer, 1, v.tax);
      offers.push(offer);
    }
    const id = randomUUID(),
      slug = randomBytes(16).toString("hex");
    await store.write({
      sql: 'INSERT INTO "SalesCampaign" (id,"agencyId","ownerId",slug,title,snapshot,"taxBps",revision,enabled,"expiresAt","createdAt") VALUES (?,?,?,?,?,?,?,1,1,?,?)',
      values: [
        id,
        input.agencyId,
        input.id,
        slug,
        v.title,
        JSON.stringify(offers),
        v.tax,
        expiresAt,
        new Date().toISOString(),
      ],
    });
    await store.write(
      insertD1(
        "Activity",
        newD1Record("Activity", {
          agencyId: input.agencyId,
          actor: input.id,
          action: `Public campaign ${id} published; approved package snapshots; tax ${v.tax} bps; expires ${expiresAt}`,
        }),
      ),
    );
    return {
      url: `${trustedOrigin()}/trips/${slug}`,
      message:
        "Campaign published. Availability and booking confirmation remain subject to agency review.",
    };
  });
}
export async function pauseCampaign(input: Actor, id: string) {
  return transaction(input.agencyId, async (store) => {
    await owner(store, input);
    if (
      !(
        await store.rows(
          'SELECT id FROM "SalesCampaign" WHERE id=? AND "agencyId"=?',
          [id, input.agencyId],
        )
      ).length
    )
      throw new HttpError(404, "Campaign not found");
    await store.write({
      sql: 'UPDATE "SalesCampaign" SET enabled=0,revision=revision+1 WHERE id=? AND "agencyId"=?',
      values: [id, input.agencyId],
    });
    await store.write(
      insertD1(
        "Activity",
        newD1Record("Activity", {
          agencyId: input.agencyId,
          actor: input.id,
          action: `Public campaign ${id} paused`,
        }),
      ),
    );
    return { message: "Campaign paused" };
  });
}
export async function submitRequest(slug: string, raw: unknown) {
  const v = requestSchema.parse(raw);
  if (
    v.travelStart.toISOString().slice(0, 10) < indiaToday() ||
    +v.travelStart > Date.now() + 730 * 86400000
  )
    throw new HttpError(400, "Choose a future departure within two years.");
  const campaign = await campaignBySlug(slug);
  return transaction(campaign.agencyId, async (store) => {
    const c = await campaignBySlug(slug, store);
    const { agency } = await owner(store, {
      id: c.ownerId,
      agencyId: c.agencyId,
      role: "OWNER",
    });
    const hash = createHash("sha256")
      .update(JSON.stringify({ campaignId: c.id, ...v }))
      .digest("hex");
    const previous = (
      await store.rows<{ id: string; requestHash: string }>(
        'SELECT id,"requestHash" FROM "PublicBookingRequest" WHERE "requestId"=?',
        [v.requestId],
      )
    )[0];
    if (previous) {
      if (previous.requestHash !== hash)
        throw new HttpError(
          409,
          "This request reference was already used. Start a new request.",
        );
      return { reference: previous.id, status: "REQUEST_RECEIVED" as const };
    }
    if (v.revision !== c.revision)
      throw new HttpError(
        409,
        "The agency updated this campaign. Refresh and review the current terms.",
      );
    const offers = z.array(offerSchema).parse(JSON.parse(c.snapshot)),
      offer = offers.find((p) => p.id === v.packageId);
    if (!offer)
      throw new HttpError(
        404,
        "This package is not published in this campaign.",
      );
    const pkg = (
      await store.read<Package>("Package", '"id"=? AND "agencyId"=?', [
        offer.id,
        c.agencyId,
      ])
    )[0];
    if (!pkg) throw missing();
    const count = store.unit
      ? await store.unit.count("Lead", '"agencyId"=?', [c.agencyId])
      : Number(
          (
            await store.rows<{ n: number }>(
              'SELECT COUNT(*) AS n FROM "Lead" WHERE "agencyId"=?',
              [c.agencyId],
            )
          )[0].n,
        );
    if (count >= limitsFor(agency.plan).leads)
      throw new HttpError(
        409,
        "The agency cannot receive another enquiry right now. Please contact them directly.",
      );
    const reference = randomUUID(),
      price = priceSummary(offer, v.travellers, c.taxBps),
      end = new Date(+v.travelStart + (offer.days - 1) * 86400000);
    const lead = newD1Record("Lead", {
      agencyId: c.agencyId,
      externalId: `WEB-${reference}`,
      customer: v.customer,
      phone: v.phone,
      email: v.email,
      destination: offer.destination,
      enquiryDate: new Date(indiaToday() + "T00:00:00Z"),
      travelStart: v.travelStart,
      travelEnd: end,
      travellers: v.travellers,
      budget: 0,
      quotedPrice: offer.price,
      source: v.attribution.source.toLowerCase().includes("google")
        ? "Google Ads"
        : /meta|facebook|instagram/i.test(v.attribution.source)
          ? "Meta Ads"
          : "Website",
      assignedId: c.ownerId,
      stage: "Quoted",
      notes: `Public booking request ${reference}. Supplier availability and final acceptance pending. Customer budget not provided. Consent: customer requested agency contact for this trip at ${new Date().toISOString()}; not marketing opt-in. Campaign ${c.id} revision ${c.revision}. Attribution: ${JSON.stringify(v.attribution)}`,
    });
    const quote = newD1Record("Quote", {
      agencyId: c.agencyId,
      leadId: lead.id,
      packageId: offer.id,
      travellers: v.travellers,
      unitPrice: offer.price,
      travelStart: v.travelStart,
      travelEnd: end,
      packageName: offer.name,
      destination: offer.destination,
      duration: offer.days,
      inclusions: offer.inclusions,
      exclusions: offer.exclusions,
      discount: 0,
      taxBps: c.taxBps,
      total: price.total,
      estimatedCost: pkg.estimatedCost * v.travellers,
      paymentTerms: offer.paymentTerms,
      cancellationTerms: offer.cancellationTerms,
      proposal: `Customer request from published campaign ${c.id}. Agency must verify supplier availability before accepting.`,
      status: "Draft",
    });
    await store.write(insertD1("Lead", lead));
    await store.write(insertD1("Quote", quote));
    await store.write({
      sql: 'INSERT INTO "PublicBookingRequest" (id,"agencyId","campaignId",revision,"requestId","requestHash","leadId","quoteId","createdAt") VALUES (?,?,?,?,?,?,?,?,?)',
      values: [
        reference,
        c.agencyId,
        c.id,
        c.revision,
        v.requestId,
        hash,
        String(lead.id),
        String(quote.id),
        new Date().toISOString(),
      ],
    });
    await store.write(
      insertD1(
        "Activity",
        newD1Record("Activity", {
          agencyId: c.agencyId,
          actor: c.ownerId,
          leadId: lead.id,
          action: `Website booking request ${reference}; campaign ${c.id}; contact consent recorded; no payment taken; agency confirmation pending`,
        }),
      ),
    );
    return { reference, status: "REQUEST_RECEIVED" as const };
  });
}
