import { randomUUID, randomBytes, createHash } from "node:crypto";
import type { Actor } from "../access";
import { z } from "zod";
import { commerceDb, hash } from "../commerce/documents";
import { guardedD1Batch, type D1Statement } from "../d1/atomic";
import { HttpError, trustedOrigin } from "../http";
import { integrationActor } from "./service";
import { seal, unseal, vaultReady, credentialContext } from "./vault";
import {
  metaReady,
  metaVersion,
  metaExchange,
  metaAccounts,
  metaPage,
  type Credential,
  type AdFact,
} from "./meta";
import {
  googleReady,
  googleExchange,
  googleAccounts,
  googlePage,
  googleRefresh,
} from "./google";

const providerSchema = z.enum(["META", "GOOGLE"]);
type Connection = {
  id: string;
  agencyId: string;
  provider: "META" | "GOOGLE";
  accountId: string;
  accountName: string;
  currency: string;
  timezone: string;
  status: string;
  credentials: string;
  revision: number;
  expiresAt: string | null;
  lastSyncedAt: string | null;
  errorCode: string;
  createdAt: string;
};
export const nativeAdsEnabled = () => process.env.NATIVE_ADS_ENABLED === "true";
function enabled() {
  if (!nativeAdsEnabled())
    throw new HttpError(
      503,
      "Native ads are disabled until provider approval and a reviewed connection pilot",
    );
}
const callback = (p: string) =>
  trustedOrigin() + "/api/integrations/" + p.toLowerCase() + "/callback";
const ownerGuard = (a: Actor): D1Statement => ({
  sql: "SELECT COUNT(*)=1 FROM User u JOIN Agency a ON a.id=u.agencyId WHERE u.id=? AND u.agencyId=? AND u.role='OWNER' AND u.disabled=0 AND a.demo=0",
  values: [a.id, a.agencyId],
});
async function owner(a: Actor) {
  enabled();
  return integrationActor(a, true);
}
async function connection(a: Actor, id: string) {
  const c = await commerceDb()
    .prepare(
      "SELECT * FROM NativeAdConnection WHERE id=? AND agencyId=? AND status!='DISCONNECTED'",
    )
    .bind(id, a.agencyId)
    .first<Connection>();
  if (!c) throw new HttpError(404, "Connection unavailable");
  return c;
}
function credential(c: Connection) {
  return unseal<Credential>(
    c.credentials,
    credentialContext(c.agencyId, c.provider, c.id),
  );
}
async function freshCredential(c: Connection, transport: typeof fetch) {
  let token = credential(c);
  if (
    c.provider === "GOOGLE" &&
    c.expiresAt &&
    Date.parse(c.expiresAt) <= Date.now() + 60000
  ) {
    token = await googleRefresh(token, transport);
    const value = seal(token, credentialContext(c.agencyId, c.provider, c.id));
    const updated = await commerceDb()
      .prepare(
        "UPDATE NativeAdConnection SET credentials=?,expiresAt=? WHERE id=? AND agencyId=? AND revision=? AND credentials=? AND status!='DISCONNECTED'",
      )
      .bind(
        value,
        token.expiresAt || null,
        c.id,
        c.agencyId,
        c.revision,
        c.credentials,
      )
      .run();
    if (updated.meta.changes !== 1)
      throw new HttpError(
        409,
        "Connection changed during token refresh; retry",
      );
  } else if (
    c.provider === "META" &&
    c.expiresAt &&
    Date.parse(c.expiresAt) <= Date.now()
  )
    throw new HttpError(409, "Meta access expired. Reconnect this account.");
  return token;
}
export async function nativeStart(inputActor: Actor, rawProvider: string) {
  const a = await owner(inputActor),
    provider = providerSchema.parse(rawProvider);
  if (!vaultReady() || !(provider === "META" ? metaReady() : googleReady()))
    throw new HttpError(
      503,
      "Provider OAuth and credential encryption configuration required",
    );
  const token = randomBytes(32).toString("base64url"),
    id = hash(token),
    verifier =
      provider === "GOOGLE" ? randomBytes(32).toString("base64url") : "";
  await guardedD1Batch(
    commerceDb(),
    [ownerGuard(a)],
    [
      {
        sql: "DELETE FROM NativeAdAuthorization WHERE expiresAt<? AND agencyId=?",
        values: [new Date().toISOString(), a.agencyId],
      },
      {
        sql: "INSERT INTO NativeAdAuthorization(id,agencyId,userId,provider,verifier,expiresAt) VALUES(?,?,?,?,?,?)",
        values: [
          id,
          a.agencyId,
          a.id,
          provider,
          verifier ? seal({ verifier }, `oauth:${a.agencyId}:${id}`) : "",
          new Date(Date.now() + 600000).toISOString(),
        ],
      },
    ],
  );
  const url =
    provider === "META"
      ? new URL(`https://www.facebook.com/${metaVersion()}/dialog/oauth`)
      : new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams(
    provider === "META"
      ? {
          client_id: process.env.META_APP_ID!,
          redirect_uri: callback(provider),
          state: token,
          scope: "ads_read",
          response_type: "code",
        }
      : {
          client_id: process.env.GOOGLE_CLIENT_ID!,
          redirect_uri: callback(provider),
          state: token,
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
  return { url: url.href };
}
export async function nativeFinish(
  inputActor: Actor,
  rawProvider: string,
  state: string,
  code: string,
  transport: typeof fetch,
) {
  const a = await owner(inputActor),
    provider = providerSchema.parse(rawProvider),
    b = commerceDb();
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4000)
    throw new HttpError(400, "Invalid OAuth callback");
  const id = hash(state),
    g = await b
      .prepare(
        "SELECT verifier FROM NativeAdAuthorization WHERE id=? AND agencyId=? AND userId=? AND provider=? AND expiresAt>?",
      )
      .bind(id, a.agencyId, a.id, provider, new Date().toISOString())
      .first<{ verifier: string }>();
  if (!g) throw new HttpError(400, "OAuth state expired or consumed");
  await guardedD1Batch(
    b,
    [
      ownerGuard(a),
      {
        sql: "SELECT COUNT(*)=1 FROM NativeAdAuthorization WHERE id=? AND agencyId=? AND userId=? AND expiresAt>?",
        values: [id, a.agencyId, a.id, new Date().toISOString()],
      },
    ],
    [{ sql: "DELETE FROM NativeAdAuthorization WHERE id=?", values: [id] }],
  );
  const token =
    provider === "META"
      ? await metaExchange(code, callback(provider), transport)
      : await googleExchange(
          code,
          callback(provider),
          unseal<{ verifier: string }>(g.verifier, `oauth:${a.agencyId}:${id}`)
            .verifier,
          transport,
        );
  await (provider === "META" ? metaAccounts : googleAccounts)(token, transport);
  const cid = randomUUID();
  await guardedD1Batch(
    b,
    [
      ownerGuard(a),
      {
        sql: "SELECT COUNT(*)<20 FROM NativeAdConnection WHERE agencyId=? AND status!='DISCONNECTED'",
        values: [a.agencyId],
      },
    ],
    [
      {
        sql: "INSERT INTO NativeAdConnection(id,agencyId,provider,status,credentials,expiresAt,createdAt) VALUES(?,?,?,'SELECT_ACCOUNT',?,?,?)",
        values: [
          cid,
          a.agencyId,
          provider,
          seal(token, credentialContext(a.agencyId, provider, cid)),
          token.expiresAt || null,
          new Date().toISOString(),
        ],
      },
    ],
  );
}
export async function nativeAccounts(
  inputActor: Actor,
  id: string,
  transport: typeof fetch,
) {
  const a = await owner(inputActor),
    c = await connection(a, id);
  if (c.status !== "SELECT_ACCOUNT")
    throw new HttpError(409, "Account selection is not pending");
  return {
    accounts: await (c.provider === "META" ? metaAccounts : googleAccounts)(
      await freshCredential(c, transport),
      transport,
    ),
  };
}
export async function nativeSelect(
  inputActor: Actor,
  id: string,
  accountId: string,
  transport: typeof fetch,
) {
  const a = await owner(inputActor),
    c = await connection(a, id);
  if (c.status !== "SELECT_ACCOUNT")
    throw new HttpError(409, "Reconnect to select a different account");
  const token = await freshCredential(c, transport),
    all = await (c.provider === "META" ? metaAccounts : googleAccounts)(
      token,
      transport,
    ),
    selected = all.find((v) => v.id === accountId);
  if (!selected)
    throw new HttpError(403, "Account not authorised by this business");
  await guardedD1Batch(
    commerceDb(),
    [
      ownerGuard(a),
      {
        sql: "SELECT COUNT(*)=1 FROM NativeAdConnection WHERE id=? AND agencyId=? AND revision=? AND status='SELECT_ACCOUNT'",
        values: [id, a.agencyId, c.revision],
      },
    ],
    [
      {
        sql: "UPDATE NativeAdConnection SET accountId=?,accountName=?,currency=?,timezone=?,status='CONNECTED',credentials=?,revision=revision+1 WHERE id=?",
        values: [
          selected.id,
          selected.name,
          selected.currency,
          selected.timezone,
          seal(
            { ...token, loginCustomerId: selected.loginCustomerId },
            credentialContext(a.agencyId, c.provider, id),
          ),
          id,
        ],
      },
    ],
  );
  return {
    message: "Read-only advertising account connected. No ads were modified.",
  };
}
export async function nativeDisconnect(inputActor: Actor, id: string) {
  const a = await integrationActor(inputActor, true, true);
  await guardedD1Batch(
    commerceDb(),
    [ownerGuard(a)],
    [
      {
        sql: "UPDATE NativeAdConnection SET status='DISCONNECTED',credentials='',revision=revision+1 WHERE id=? AND agencyId=?",
        values: [id, a.agencyId],
      },
    ],
  );
  return {
    message:
      "Connection disabled and stored credentials removed. Revoke provider access in account settings too.",
  };
}
export async function nativeOverview(inputActor: Actor) {
  const a = await integrationActor(inputActor),
    b = commerceDb(),
    connections = (
      await b
        .prepare(
          "SELECT id,provider,accountId,accountName,currency,timezone,status,expiresAt,lastSyncedAt,errorCode FROM NativeAdConnection WHERE agencyId=? AND status!='DISCONNECTED' ORDER BY createdAt DESC LIMIT 20",
        )
        .bind(a.agencyId)
        .all<
          Omit<
            Connection,
            "credentials" | "revision" | "agencyId" | "createdAt"
          >
        >()
    ).results;
  const rows = (
    await b
      .prepare(
        "SELECT s.facts,s.connectionId,s.syncedAt,c.currency,c.timezone FROM NativeAdSnapshot s JOIN NativeAdConnection c ON c.id=s.connectionId AND c.agencyId=s.agencyId WHERE s.agencyId=? AND c.status='CONNECTED' ORDER BY s.day DESC LIMIT 14",
      )
      .bind(a.agencyId)
      .all<{
        facts: string;
        connectionId: string;
        syncedAt: string;
        currency: string;
        timezone: string;
      }>()
  ).results;
  return {
    availability: {
      enabled: nativeAdsEnabled(),
      note: "Native D1 read-only spend snapshots; provider approval and encrypted OAuth configuration are required. Currency and account timezone stay separate.",
    },
    configured: {
      META: nativeAdsEnabled() && vaultReady() && metaReady(),
      GOOGLE: nativeAdsEnabled() && vaultReady() && googleReady(),
    },
    connections,
    accounts: {},
    runs: [],
    facts: rows
      .flatMap((r) =>
        JSON.parse(r.facts).map((f: AdFact) => ({
          ...f,
          connectionId: r.connectionId,
          syncedAt: r.syncedAt,
          currency: r.currency,
          timezone: r.timezone,
        })),
      )
      .slice(0, 100),
    owner: a.role === "OWNER",
  };
}
export async function nativeSync(
  inputActor: Actor | undefined,
  agencyId: string,
  id: string,
  from: string,
  to: string,
  transport: typeof fetch,
) {
  if (!inputActor || inputActor.agencyId !== agencyId)
    throw new HttpError(403, "Native sync requires an authenticated owner");
  const a = await owner(inputActor),
    c = await connection(a, id);
  if (c.status !== "CONNECTED")
    throw new HttpError(409, "Select a connected account");
  for (const day of [from, to])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day
    )
      throw new HttpError(400, "Invalid calendar date");
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (!Number.isInteger(days) || days < 1 || days > 7)
    throw new HttpError(400, "Choose at most seven calendar days");
  const token = await freshCredential(c, transport),
    writes: D1Statement[] = [];
  for (let n = 0; n < days; n++) {
    const day = new Date(Date.parse(from) + n * 86400000)
      .toISOString()
      .slice(0, 10);
    let cursor = "",
      facts: AdFact[] = [];
    const seen = new Set<string>();
    for (let page = 0; page < 3; page++) {
      const result = await (c.provider === "META" ? metaPage : googlePage)(
        token,
        c.accountId,
        day,
        day,
        cursor,
        transport,
      );
      facts.push(...result.facts);
      if (facts.length > 600)
        throw new HttpError(
          422,
          "Account volume exceeds the reviewed pilot bound; no previous report was replaced",
        );
      if (!result.cursor) {
        cursor = "";
        break;
      }
      if (seen.has(result.cursor))
        throw new HttpError(502, "Provider cursor repeated; report unchanged");
      seen.add(result.cursor);
      cursor = result.cursor;
    }
    if (cursor)
      throw new HttpError(
        422,
        "Provider pagination exceeds the pilot limit; report unchanged",
      );
    const keys = new Set<string>();
    for (const f of facts) {
      if (
        f.day !== day ||
        !/^\d+$/.test(f.spendMicros) ||
        !/^\d+$/.test(f.impressions) ||
        !/^\d+$/.test(f.clicks)
      )
        throw new HttpError(502, "Invalid provider report facts");
      const key = f.day + ":" + f.campaignId + ":" + f.adSetId;
      if (keys.has(key))
        throw new HttpError(502, "Duplicate provider fact; report unchanged");
      keys.add(key);
    }
    writes.push({
      sql: "INSERT INTO NativeAdSnapshot(connectionId,agencyId,day,facts,syncedAt) VALUES(?,?,?,?,?) ON CONFLICT(connectionId,day) DO UPDATE SET facts=excluded.facts,syncedAt=excluded.syncedAt",
      values: [
        id,
        a.agencyId,
        day,
        JSON.stringify(facts),
        new Date().toISOString(),
      ],
    });
  }
  writes.push({
    sql: "UPDATE NativeAdConnection SET lastSyncedAt=?,errorCode='',revision=revision+1 WHERE id=?",
    values: [new Date().toISOString(), id],
  });
  await guardedD1Batch(
    commerceDb(),
    [
      ownerGuard(a),
      {
        sql: "SELECT COUNT(*)=1 FROM NativeAdConnection WHERE id=? AND agencyId=? AND revision=? AND status='CONNECTED'",
        values: [id, a.agencyId, c.revision],
      },
    ],
    writes,
  );
  return {
    message:
      "Complete read-only spend snapshots saved. Conversion counters are provider-reported, not CRM bookings.",
  };
}
