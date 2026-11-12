import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { requireOwner, canManage, type Actor } from "../access";
import { HttpError, trustedOrigin } from "../http";
import { requireSubscription } from "../subscriptions";
import { reportingWindow, calendarDate } from "../reporting-time";
import { seal, unseal, credentialContext, vaultReady } from "./vault";
import {
  metaReady,
  metaVersion,
  metaAccounts,
  metaExchange,
  metaPage,
  type Credential,
  type AdAccount,
  type AdFact,
} from "./meta";
import {
  googleReady,
  googleExchange,
  googleAccounts,
  googlePage,
  googleRefresh,
} from "./google";
import { ProviderError } from "./provider-http";
export const providerSchema = z.enum(["META", "GOOGLE"]);
export async function integrationActor(
  a: Actor,
  write = false,
  allowInactive = false,
) {
  if (a.demo) throw new HttpError(403, "Demo integrations are read-only");
  const u = await db.user.findUnique({
    where: { id: a.id },
    include: { agency: true },
  });
  if (!u || u.disabled || u.agencyId !== a.agencyId || u.agency?.demo)
    throw new HttpError(403, "Integration access unavailable");
  const actor = { ...a, role: u.role };
  if (write) {
    requireOwner(actor);
    if (!allowInactive) requireSubscription(u.agency!);
  } else canManage(actor);
  return actor;
}
const callback = (provider: string) =>
  `${trustedOrigin()}/api/integrations/${provider.toLowerCase()}/callback`;
export async function startAuthorization(inputActor: Actor, provider: string) {
  const a = await integrationActor(inputActor, true);
  providerSchema.parse(provider);
  if (!vaultReady() || !(provider === "META" ? metaReady() : googleReady()))
    throw new HttpError(
      503,
      "Provider app approval, version, redirect and encryption configuration are required.",
    );
  const state = randomBytes(32).toString("base64url"),
    id = createHash("sha256").update(state).digest("hex");
  const verifier =
    provider === "GOOGLE" ? randomBytes(32).toString("base64url") : "";
  await db.integrationAuthorization.create({
    data: {
      id,
      agencyId: a.agencyId,
      userId: a.id,
      provider,
      verifier: verifier ? seal({ verifier }, `oauth:${a.agencyId}:${id}`) : "",
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  const url =
    provider === "META"
      ? new URL(`https://www.facebook.com/${metaVersion()}/dialog/oauth`)
      : new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams(
    provider === "META"
      ? {
          client_id: process.env.META_APP_ID!,
          redirect_uri: callback(provider),
          state,
          scope: "ads_read",
          response_type: "code",
        }
      : {
          client_id: process.env.GOOGLE_CLIENT_ID!,
          redirect_uri: callback(provider),
          state,
          scope: "https://www.googleapis.com/auth/adwords",
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          code_challenge_method: "S256",
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
        },
  ).toString();
  return { url: url.toString() };
}
export async function finishAuthorization(
  inputActor: Actor,
  provider: string,
  state: string,
  code: string,
  transport: typeof fetch = fetch,
) {
  const a = await integrationActor(inputActor, true);
  providerSchema.parse(provider);
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4000)
    throw new HttpError(400, "Invalid authorization callback");
  const id = createHash("sha256").update(state).digest("hex");
  const grant = await db.integrationAuthorization.findFirst({
    where: {
      id,
      agencyId: a.agencyId,
      userId: a.id,
      provider,
      expiresAt: { gt: new Date() },
    },
  });
  if (
    !grant ||
    !(
      await db.integrationAuthorization.deleteMany({
        where: {
          id,
          agencyId: a.agencyId,
          userId: a.id,
          provider,
          expiresAt: { gt: new Date() },
        },
      })
    ).count
  )
    throw new HttpError(
      400,
      "Authorization expired or was already consumed. Start again.",
    );
  const token =
    provider === "META"
      ? await metaExchange(code, callback(provider), transport)
      : await googleExchange(
          code,
          callback(provider),
          unseal<{ verifier: string }>(
            grant.verifier,
            `oauth:${a.agencyId}:${id}`,
          ).verifier,
          transport,
        );
  await (provider === "META"
    ? metaAccounts(token, transport)
    : googleAccounts(token, transport));
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Agency" WHERE id=${a.agencyId} FOR UPDATE`;
    const existing = await tx.integrationConnection.findUnique({
      where: {
        agencyId_provider_accountId: {
          agencyId: a.agencyId,
          provider,
          accountId: "",
        },
      },
    });
    const connectionId = existing?.id || randomUUID();
    const credentials = seal(
      token,
      credentialContext(a.agencyId, provider, connectionId),
    );
    await tx.integrationConnection.upsert({
      where: {
        agencyId_provider_accountId: {
          agencyId: a.agencyId,
          provider,
          accountId: "",
        },
      },
      create: {
        id: connectionId,
        agencyId: a.agencyId,
        provider,
        credentials,
        expiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
      },
      update: {
        credentials,
        status: "SELECT_ACCOUNT",
        expiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
        revision: { increment: 1 },
        errorCode: "",
      },
    });
  });
  await db.activity.create({
    data: {
      agencyId: a.agencyId,
      actor: a.id,
      action: `${provider} authorization granted; account selection required`,
    },
  });
}
async function permittedConnection(a: Actor, id: string) {
  const c = await db.integrationConnection.findFirst({
    where: { id, agencyId: a.agencyId },
  });
  if (!c || c.status === "DISCONNECTED")
    throw new HttpError(404, "Connection unavailable");
  if (c.provider !== "GOOGLE" && c.expiresAt && +c.expiresAt <= Date.now()) {
    await db.integrationConnection.updateMany({
      where: { id: c.id, agencyId: a.agencyId, revision: c.revision },
      data: { status: "NEEDS_REAUTH", errorCode: "NEEDS_REAUTH" },
    });
    throw new ProviderError("NEEDS_REAUTH");
  }
  return c;
}
export async function selectAdAccount(
  inputActor: Actor,
  id: string,
  accountId: string,
  transport: typeof fetch = fetch,
) {
  const a = await integrationActor(inputActor, true),
    c = await permittedConnection(a, id);
  if (c.status !== "SELECT_ACCOUNT")
    throw new HttpError(
      409,
      "Start a new authorization to select another account",
    );
  const token = await credentialsFor(c, transport);
  const accounts = await (c.provider === "META"
    ? metaAccounts(token, transport)
    : googleAccounts(token, transport));
  const selected = accounts.find((x) => x.id === accountId);
  if (!selected)
    throw new HttpError(403, "Advertising account is not authorized");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Agency" WHERE id=${a.agencyId} FOR UPDATE`;
    const existing = await tx.integrationConnection.findUnique({
      where: {
        agencyId_provider_accountId: {
          agencyId: a.agencyId,
          provider: c.provider,
          accountId: selected.id,
        },
      },
    });
    const target = existing?.id || randomUUID();
    const credentials = seal(
      { ...token, loginCustomerId: selected.loginCustomerId },
      credentialContext(a.agencyId, c.provider, target),
    );

    const pending = await tx.integrationConnection.findFirst({
      where: {
        id: c.id,
        agencyId: a.agencyId,
        status: "SELECT_ACCOUNT",
        revision: c.revision,
      },
    });
    if (!pending)
      throw new HttpError(409, "Authorization changed; start again");
    await tx.integrationConnection.upsert({
      where: {
        agencyId_provider_accountId: {
          agencyId: a.agencyId,
          provider: c.provider,
          accountId: selected.id,
        },
      },
      create: {
        id: target,
        agencyId: a.agencyId,
        provider: c.provider,
        accountId: selected.id,
        accountName: selected.name,
        currency: selected.currency,
        timezone: selected.timezone,
        status: "CONNECTED",
        credentials,
        expiresAt: c.expiresAt,
      },
      update: {
        accountName: selected.name,
        currency: selected.currency,
        timezone: selected.timezone,
        status: "CONNECTED",
        credentials,
        expiresAt: c.expiresAt,
        revision: { increment: 1 },
        errorCode: "",
      },
    });
    await tx.integrationConnection.update({
      where: { id: c.id },
      data: {
        status: "DISCONNECTED",
        credentials: "",
        revision: { increment: 1 },
      },
    });
    await tx.activity.create({
      data: {
        agencyId: a.agencyId,
        actor: a.id,
        action: `${c.provider} account connected: ${selected.id}`,
      },
    });
    return {
      message: "Advertising account connected. No campaigns were changed.",
    };
  });
}
export async function disconnectAdAccount(inputActor: Actor, id: string) {
  const a = await integrationActor(inputActor, true, true),
    c = await db.integrationConnection.findFirst({
      where: { id, agencyId: a.agencyId },
    });
  if (!c) throw new HttpError(404, "Connection unavailable");
  await db.$transaction(async (tx) => {
    await tx.integrationConnection.update({
      where: { id: c.id },
      data: {
        status: "DISCONNECTED",
        credentials: "",
        revision: { increment: 1 },
        errorCode: "",
      },
    });
    await tx.integrationSyncRun.updateMany({
      where: { connectionId: c.id, agencyId: a.agencyId, status: "RUNNING" },
      data: { status: "FAILED", errorCode: "DISCONNECTED", staged: [] },
    });
    await tx.activity.create({
      data: {
        agencyId: a.agencyId,
        actor: a.id,
        action: `${c.provider} disconnected locally; revoke provider access in account settings too`,
      },
    });
  });
  return {
    message:
      "Connection disabled and credentials removed. Revoke provider access in account settings too.",
  };
}
export async function integrationOverview(
  inputActor: Actor,
  transport: typeof fetch = fetch,
) {
  const a = await integrationActor(inputActor);
  const connections = await db.integrationConnection.findMany({
    where: { agencyId: a.agencyId, status: { not: "DISCONNECTED" } },
    select: {
      id: true,
      provider: true,
      accountId: true,
      accountName: true,
      currency: true,
      timezone: true,
      status: true,
      expiresAt: true,
      lastSyncedAt: true,
      errorCode: true,
    },
    take: 50,
    orderBy: { createdAt: "desc" },
  });
  const accounts: Record<string, AdAccount[]> = {};
  const runs = await db.integrationSyncRun.findMany({
    where: { agencyId: a.agencyId },
    select: {
      id: true,
      connectionId: true,
      fromDate: true,
      toDate: true,
      status: true,
      errorCode: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const facts = await db.adDailyMetric.findMany({
    where: { agencyId: a.agencyId },
    select: {
      day: true,
      connectionId: true,
      campaignId: true,
      campaignName: true,
      adSetId: true,
      adSetName: true,
      spendMicros: true,
      impressions: true,
      clicks: true,
      providerConversions: true,
      conversionDefinition: true,
      currency: true,
      timezone: true,
      syncedAt: true,
    },
    orderBy: [{ day: "desc" }, { campaignId: "asc" }],
    take: 100,
  });
  return {
    configured: {
      META: metaReady() && vaultReady(),
      GOOGLE: googleReady() && vaultReady(),
    },
    connections,
    accounts,
    runs,
    facts: facts.map((r) => ({
      ...r,
      spendMicros: r.spendMicros.toString(),
      impressions: r.impressions.toString(),
      clicks: r.clicks.toString(),
    })),
    owner: a.role === "OWNER",
  };
}
export async function syncAds(
  agencyId: string,
  connectionId: string,
  from: string,
  to: string,
  transport: typeof fetch = fetch,
) {
  const c = await permittedConnection(
    { id: "sync-worker", agencyId, role: "OWNER" },
    connectionId,
  );
  if (c.status !== "CONNECTED")
    throw new HttpError(409, "Connection is not enabled");
  const w = reportingWindow(from, to, c.timezone);
  if (w.days > 31 || to >= calendarDate(new Date(), c.timezone))
    throw new HttpError(
      400,
      "Sync 1–31 closed account-calendar days at a time",
    );
  const leaseToken = randomUUID();
  let run = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IntegrationConnection" WHERE id=${c.id} AND "agencyId"=${agencyId} FOR UPDATE`;
    if (
      await tx.integrationSyncRun.findFirst({
        where: {
          connectionId: c.id,
          agencyId,
          status: "RUNNING",
          leaseUntil: { gt: new Date() },
        },
      })
    )
      throw new HttpError(409, "Sync already running");
    const resume = await tx.integrationSyncRun.findFirst({
      where: {
        connectionId: c.id,
        agencyId,
        status: "RUNNING",
        fromDate: from,
        toDate: to,
        revision: c.revision,
        leaseUntil: { lte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    return resume
      ? tx.integrationSyncRun.update({
          where: { id: resume.id },
          data: { leaseToken, leaseUntil: new Date(Date.now() + 45000) },
        })
      : tx.integrationSyncRun.create({
          data: {
            agencyId,
            connectionId: c.id,
            fromDate: from,
            toDate: to,
            revision: c.revision,
            leaseToken,
            leaseUntil: new Date(Date.now() + 45000),
          },
        });
  });
  let facts = run.staged as unknown as AdFact[],
    cursor = run.cursor;
  try {
    const token = await credentialsFor(c, transport);
    for (let page = 0; page < 3; page++) {
      const beforeFetch = await db.integrationConnection.findFirst({
        where: {
          id: c.id,
          agencyId,
          status: "CONNECTED",
          revision: c.revision,
        },
      });
      if (!beforeFetch) throw new ProviderError("CONNECTION_CHANGED");
      const result = await (c.provider === "META" ? metaPage : googlePage)(
        token,
        c.accountId,
        from,
        to,
        cursor,
        transport,
      );
      facts = [...facts, ...result.facts];
      if (facts.length > 5000) throw new ProviderError("NARROW_DATE_RANGE");
      const keys = facts.map((r) => `${r.day}:${r.campaignId}:${r.adSetId}`);
      if (new Set(keys).size !== keys.length)
        throw new ProviderError("DUPLICATE_DIMENSIONS");
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "IntegrationConnection" WHERE id=${c.id} AND "agencyId"=${agencyId} FOR UPDATE`;
        const active = await tx.integrationConnection.findFirst({
          where: {
            id: c.id,
            agencyId,
            status: "CONNECTED",
            revision: c.revision,
          },
        });
        if (!active) throw new ProviderError("CONNECTION_CHANGED");
        const lease = await tx.integrationSyncRun.updateMany({
          where: { id: run.id, agencyId, leaseToken, status: "RUNNING" },
          data: {
            staged: facts,
            cursor: result.cursor || "",
            leaseUntil: new Date(Date.now() + 45000),
          },
        });
        if (lease.count !== 1) throw new ProviderError("LEASE_LOST");
        if (!result.cursor) {
          await tx.adDailyMetric.deleteMany({
            where: {
              agencyId,
              connectionId: c.id,
              day: { gte: from, lte: to },
            },
          });
          if (facts.length)
            await tx.adDailyMetric.createMany({
              data: facts.map((f) => ({
                ...f,
                id: randomUUID(),
                agencyId,
                connectionId: c.id,
                currency: c.currency,
                timezone: c.timezone,
                spendMicros: BigInt(f.spendMicros),
                impressions: BigInt(f.impressions),
                clicks: BigInt(f.clicks),
              })),
            });
          await tx.integrationSyncRun.update({
            where: { id: run.id },
            data: { status: "COMPLETE", completedAt: new Date(), staged: [] },
          });
          await tx.integrationConnection.update({
            where: { id: c.id },
            data: { lastSyncedAt: new Date(), errorCode: "" },
          });
        }
      });
      if (!result.cursor)
        return {
          message:
            "Daily advertising facts synchronized. Currency/timezone preserved; no CRM conversions or leads were invented.",
        };
      cursor = result.cursor;
    }
    await db.integrationSyncRun.updateMany({
      where: { id: run.id, agencyId, leaseToken, status: "RUNNING" },
      data: { leaseUntil: new Date() },
    });
    return {
      message:
        "Sync checkpoint saved. Continue this same window to resume remaining pages; complete report unchanged until then.",
    };
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "INVALID_RESPONSE";
    await db.integrationSyncRun.updateMany({
      where: { id: run.id, agencyId, leaseToken },
      data: { status: "FAILED", errorCode: code, staged: [] },
    });
    await db.integrationConnection.updateMany({
      where: { id: c.id, agencyId, revision: c.revision },
      data: {
        errorCode: code,
        ...(code === "NEEDS_REAUTH" ? { status: "NEEDS_REAUTH" } : {}),
      },
    });
    throw new HttpError(
      502,
      `Advertising sync failed: ${code}. Previous complete facts were preserved.`,
    );
  }
}

export async function authorizedAccounts(
  inputActor: Actor,
  id: string,
  transport: typeof fetch = fetch,
) {
  const a = await integrationActor(inputActor, true),
    c = await permittedConnection(a, id);
  if (c.status !== "SELECT_ACCOUNT")
    throw new HttpError(409, "Account selection is not pending");
  return {
    accounts: await (c.provider === "META" ? metaAccounts : googleAccounts)(
      await credentialsFor(c, transport),
      transport,
    ),
  };
}

async function credentialsFor(
  c: {
    id: string;
    agencyId: string;
    provider: string;
    credentials: string;
    expiresAt: Date | null;
  },
  transport: typeof fetch,
) {
  const token = unseal<Credential>(
    c.credentials,
    credentialContext(c.agencyId, c.provider, c.id),
  );
  if (
    c.provider !== "GOOGLE" ||
    !c.expiresAt ||
    +c.expiresAt > Date.now() + 60000
  )
    return token;
  const refreshed = await googleRefresh(token, transport);
  const changed = await db.integrationConnection.updateMany({
    where: {
      id: c.id,
      agencyId: c.agencyId,
      credentials: c.credentials,
      status: { not: "DISCONNECTED" },
    },
    data: {
      credentials: seal(
        refreshed,
        credentialContext(c.agencyId, c.provider, c.id),
      ),
      expiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt) : null,
    },
  });
  if (changed.count) return refreshed;
  const current = await db.integrationConnection.findFirst({
    where: { id: c.id, agencyId: c.agencyId, status: { not: "DISCONNECTED" } },
  });
  if (!current) throw new ProviderError("CONNECTION_CHANGED");
  return unseal<Credential>(
    current.credentials,
    credentialContext(c.agencyId, c.provider, c.id),
  );
}
