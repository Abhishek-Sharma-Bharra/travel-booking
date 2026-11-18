import { trustedOrigin } from "../http";
import { vaultReady } from "./vault";
import { metaReady } from "./meta";
import { googleReady } from "./google";
export function integrationSetup() {
  const vaultMissing = vaultReady()
    ? []
    : ["INTEGRATION_ENCRYPTION_KEYS", "INTEGRATION_ACTIVE_KEY"];
  const describe = (
    provider: "META" | "GOOGLE",
    names: string[],
    ready: boolean,
  ) => ({
    callbackUrl: `${trustedOrigin()}/api/integrations/${provider.toLowerCase()}/callback`,
    configured: ready && vaultReady(),
    missing: [
      ...names.filter((name) => !process.env[name]?.trim()),
      ...vaultMissing,
    ],
    permission:
      provider === "META"
        ? "ads_read"
        : "https://www.googleapis.com/auth/adwords",
    mode: "Read advertising accounts and daily performance. No campaign or budget changes; no native lead-form import.",
  });
  return {
    META: describe(
      "META",
      ["META_APP_ID", "META_APP_SECRET", "META_GRAPH_VERSION"],
      metaReady(),
    ),
    GOOGLE: describe(
      "GOOGLE",
      [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_ADS_DEVELOPER_TOKEN",
        "GOOGLE_ADS_API_VERSION",
      ],
      googleReady(),
    ),
  };
}
