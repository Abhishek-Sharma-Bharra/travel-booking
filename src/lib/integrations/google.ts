import { z } from "zod";
import { providerJson, ProviderError } from "./provider-http";
import type { Credential, AdAccount, AdFact } from "./meta";
import { validTimezone } from "../reporting-time";
export function googleVersion() {
  const v = process.env.GOOGLE_ADS_API_VERSION;
  if (!v || !/^v\d{2,3}$/.test(v))
    throw new ProviderError("GOOGLE_VERSION_NOT_CONFIGURED");
  return v;
}
export const googleReady = () => {
  try {
    return !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      googleVersion()
    );
  } catch {
    return false;
  }
};
async function tokenRequest(
  parameters: Record<string, string>,
  transport: typeof fetch,
) {
  const b = z
    .object({
      access_token: z.string().min(10),
      refresh_token: z.string().optional(),
      expires_in: z.number().positive(),
    })
    .parse(
      await providerJson(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            ...parameters,
          }).toString(),
        },
        transport,
      ),
    );
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    expiresAt: new Date(Date.now() + b.expires_in * 1000).toISOString(),
  };
}
export async function googleExchange(
  code: string,
  redirect: string,
  verifier: string,
  transport: typeof fetch = fetch,
) {
  const t = await tokenRequest(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      code_verifier: verifier,
    },
    transport,
  );
  if (!t.refreshToken)
    throw new ProviderError("OFFLINE_AUTHORIZATION_REQUIRED");
  return t;
}
export async function googleRefresh(
  token: Credential,
  transport: typeof fetch = fetch,
): Promise<Credential> {
  if (!token.refreshToken) throw new ProviderError("NEEDS_REAUTH");
  const t = await tokenRequest(
    { grant_type: "refresh_token", refresh_token: token.refreshToken },
    transport,
  );
  return { ...token, ...t, refreshToken: t.refreshToken || token.refreshToken };
}
function headers(token: Credential) {
  return {
    Authorization: `Bearer ${token.accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    "Content-Type": "application/json",
    ...(token.loginCustomerId
      ? { "login-customer-id": token.loginCustomerId }
      : {}),
  };
}
async function query(
  token: Credential,
  id: string,
  gaql: string,
  pageToken: string,
  transport: typeof fetch,
) {
  if (!/^\d{6,20}$/.test(id)) throw new ProviderError("INVALID_ACCOUNT");
  return providerJson(
    `https://googleads.googleapis.com/${googleVersion()}/customers/${id}/googleAds:search`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        query: gaql,
        ...(pageToken ? { pageToken } : {}),
      }),
    },
    transport,
  );
}
const account = z.object({
  id: z
    .union([z.string(), z.number()])
    .transform(String)
    .refine((v) => /^\d{6,20}$/.test(v)),
  descriptiveName: z.string().max(300).default("Google Ads account"),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  timeZone: z.string().refine(validTimezone),
  manager: z.boolean().default(false),
});
export async function googleAccounts(
  token: Credential,
  transport: typeof fetch = fetch,
): Promise<AdAccount[]> {
  const list = z
    .object({
      resourceNames: z
        .array(z.string().regex(/^customers\/\d{6,20}$/))
        .max(20)
        .default([]),
    })
    .parse(
      await providerJson(
        `https://googleads.googleapis.com/${googleVersion()}/customers:listAccessibleCustomers`,
        { headers: headers(token) },
        transport,
      ),
    );
  const accounts: AdAccount[] = [];
  for (const resource of list.resourceNames) {
    const id = resource.split("/")[1];
    let root;
    try {
      root = z
        .object({ results: z.array(z.object({ customer: account })).min(1) })
        .parse(
          await query(
            { ...token, loginCustomerId: undefined },
            id,
            "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1",
            "",
            transport,
          ),
        ).results[0].customer;
    } catch (e) {
      if (e instanceof ProviderError && e.code === "PERMISSION") continue;
      throw e;
    }
    if (root.id !== id) throw new ProviderError("INVALID_ACCOUNT");
    if (!root.manager) {
      accounts.push({
        id: root.id,
        name: root.descriptiveName,
        currency: root.currencyCode,
        timezone: root.timeZone,
      });
      continue;
    }
    let page = "";
    for (let count = 0; count < 10; count++) {
      const result = z
        .object({
          results: z
            .array(
              z.object({
                customerClient: z.object({
                  clientCustomer: z.string().regex(/^customers\/\d{6,20}$/),
                  descriptiveName: z.string().max(300),
                  currencyCode: z.string().regex(/^[A-Z]{3}$/),
                  timeZone: z.string().refine(validTimezone),
                }),
              }),
            )
            .default([]),
          nextPageToken: z.string().optional(),
        })
        .parse(
          await query(
            { ...token, loginCustomerId: id },
            id,
            "SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone FROM customer_client WHERE customer_client.manager = FALSE",
            page,
            transport,
          ),
        );
      accounts.push(
        ...result.results.map(({ customerClient: c }) => ({
          id: c.clientCustomer.split("/")[1],
          name: c.descriptiveName,
          currency: c.currencyCode,
          timezone: c.timeZone,
          loginCustomerId: id,
        })),
      );
      if (accounts.length > 1000) throw new ProviderError("ACCOUNT_LIMIT");
      if (!result.nextPageToken) break;
      page = result.nextPageToken;
      if (count === 9) throw new ProviderError("ACCOUNT_LIMIT");
    }
  }
  return [...new Map(accounts.map((a) => [a.id, a])).values()];
}
const integer = z
  .string()
  .regex(/^\d{1,18}$/)
  .default("0");
export async function googlePage(
  token: Credential,
  id: string,
  from: string,
  to: string,
  cursor: string,
  transport: typeof fetch = fetch,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    throw new ProviderError("INVALID_REPORT_RANGE");
  const result = z
    .object({
      results: z
        .array(
          z.object({
            segments: z.object({ date: z.string() }),
            campaign: z.object({
              id: z.union([z.string(), z.number()]).transform(String),
              name: z.string().max(500),
            }),
            metrics: z.object({
              costMicros: integer,
              impressions: integer,
              clicks: integer,
              conversions: z
                .union([z.string(), z.number()])
                .transform(String)
                .refine((v) => /^\d{1,18}(\.\d{1,8})?$/.test(v))
                .optional(),
            }),
          }),
        )
        .default([]),
      nextPageToken: z.string().max(4000).optional(),
    })
    .parse(
      await query(
        token,
        id,
        `SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' ORDER BY segments.date, campaign.id`,
        cursor,
        transport,
      ),
    );
  if (
    result.results.some(
      (r) =>
        r.segments.date < from ||
        r.segments.date > to ||
        new Date(r.segments.date).toISOString().slice(0, 10) !==
          r.segments.date,
    )
  )
    throw new ProviderError("INVALID_REPORT_RANGE");
  return {
    facts: result.results.map((r) => ({
      day: r.segments.date,
      campaignId: r.campaign.id,
      campaignName: r.campaign.name,
      adSetId: "",
      adSetName: "",
      spendMicros: r.metrics.costMicros,
      impressions: r.metrics.impressions,
      clicks: r.metrics.clicks,
      providerConversions: r.metrics.conversions || "0",
      conversionDefinition:
        "GOOGLE_ADS_PRIMARY_CONVERSIONS_AS_REPORTED; action/window definitions may differ; not CRM bookings",
    })),
    cursor: result.nextPageToken || null,
  };
}
