import { z } from "zod";
import { providerJson, decimalMicros, ProviderError } from "./provider-http";
import { validTimezone } from "../reporting-time";
export type AdAccount = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  loginCustomerId?: string;
};
export type AdFact = {
  day: string;
  campaignId: string;
  campaignName: string;
  adSetId: string;
  adSetName: string;
  spendMicros: string;
  impressions: string;
  clicks: string;
  providerConversions?: string;
  conversionDefinition?: string;
};
export type Credential = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  loginCustomerId?: string;
};
export function metaVersion() {
  const v = process.env.META_GRAPH_VERSION;
  if (!v || !/^v\d{2}\.0$/.test(v))
    throw new ProviderError("META_VERSION_NOT_CONFIGURED");
  return v;
}
export const metaReady = () => {
  try {
    return !!(
      process.env.META_APP_ID &&
      process.env.META_APP_SECRET &&
      metaVersion()
    );
  } catch {
    return false;
  }
};
export async function metaExchange(
  code: string,
  redirect: string,
  transport: typeof fetch = fetch,
): Promise<Credential> {
  const url = new URL(
    `https://graph.facebook.com/${metaVersion()}/oauth/access_token`,
  );
  const form = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: redirect,
    code,
  }).toString();
  const result = z
    .object({
      access_token: z.string().min(10),
      expires_in: z.number().positive().optional(),
    })
    .parse(
      await providerJson(
        url.toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
        },
        transport,
      ),
    );
  return {
    accessToken: result.access_token,
    expiresAt: result.expires_in
      ? new Date(Date.now() + result.expires_in * 1000).toISOString()
      : undefined,
  };
}
export async function metaAccounts(
  token: Credential,
  transport: typeof fetch = fetch,
): Promise<AdAccount[]> {
  const accounts: AdAccount[] = [];
  let after = "";
  for (let page = 0; page < 10; page++) {
    const url = new URL(
      `https://graph.facebook.com/${metaVersion()}/me/adaccounts`,
    );
    url.search = new URLSearchParams({
      fields: "id,name,currency,timezone_name",
      limit: "100",
      ...(after ? { after } : {}),
    }).toString();
    const b = z
      .object({
        data: z.array(
          z.object({
            id: z.string().regex(/^act_\d+$/),
            name: z.string().max(300),
            currency: z.string().regex(/^[A-Z]{3}$/),
            timezone_name: z.string().refine(validTimezone),
          }),
        ),
        paging: z
          .object({
            cursors: z
              .object({ after: z.string().max(2000).optional() })
              .optional(),
            next: z.string().optional(),
          })
          .optional(),
      })
      .parse(
        await providerJson(
          url.toString(),
          { headers: { Authorization: `Bearer ${token.accessToken}` } },
          transport,
        ),
      );
    accounts.push(
      ...b.data.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone_name,
      })),
    );
    if (!b.paging?.next) return accounts;
    after = b.paging.cursors?.after || "";
    if (!after) throw new ProviderError("INVALID_PAGING");
  }
  throw new ProviderError("ACCOUNT_LIMIT");
}
const integer = z.string().regex(/^\d{1,18}$/);
export async function metaPage(
  token: Credential,
  account: string,
  from: string,
  to: string,
  cursor: string,
  transport: typeof fetch = fetch,
) {
  if (!/^act_\d+$/.test(account)) throw new ProviderError("INVALID_ACCOUNT");
  const url = new URL(
    `https://graph.facebook.com/${metaVersion()}/${account}/insights`,
  );
  url.search = new URLSearchParams({
    level: "adset",
    time_increment: "1",
    time_range: JSON.stringify({ since: from, until: to }),
    fields:
      "date_start,date_stop,campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks",
    limit: "100",
    ...(cursor ? { after: cursor } : {}),
  }).toString();
  const result = z
    .object({
      data: z.array(
        z.object({
          date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          date_stop: z.string(),
          campaign_id: z.string().max(100),
          campaign_name: z.string().max(500),
          adset_id: z.string().max(100),
          adset_name: z.string().max(500),
          spend: z.string(),
          impressions: integer,
          clicks: integer,
        }),
      ),
      paging: z
        .object({
          cursors: z
            .object({ after: z.string().max(2000).optional() })
            .optional(),
          next: z.string().optional(),
        })
        .optional(),
    })
    .parse(
      await providerJson(
        url.toString(),
        { headers: { Authorization: `Bearer ${token.accessToken}` } },
        transport,
      ),
    );
  if (
    result.data.some(
      (r) =>
        r.date_start !== r.date_stop ||
        r.date_start < from ||
        r.date_start > to,
    )
  )
    throw new ProviderError("INVALID_REPORT_RANGE");
  if (result.paging?.next && !result.paging.cursors?.after)
    throw new ProviderError("INVALID_PAGING");
  return {
    facts: result.data.map((r) => ({
      day: r.date_start,
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      adSetId: r.adset_id,
      adSetName: r.adset_name,
      spendMicros: decimalMicros(r.spend),
      impressions: r.impressions,
      clicks: r.clicks,
    })),
    cursor: result.paging?.next ? result.paging.cursors?.after || null : null,
  };
}
