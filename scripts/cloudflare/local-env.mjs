import { parse } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const useD1 = process.argv.includes("--d1");
const env = useD1 ? {} : parse(await readFile(".env"));
const url = useD1 ? null : new URL(env.DATABASE_URL || "");
if (url && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  throw Error("Local preview accepts only a localhost test database");
const origin = "http://localhost:3000";
await writeFile(
  "cloudflare/worker/.dev.vars",
  Object.entries({
    DATABASE_URL: useD1 ? "" : env.DATABASE_URL,
    TRAVELOS_DATABASE_ENGINE: useD1 ? "d1" : "postgresql",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: origin,
    TRAVELOS_RUNTIME: "cloudflare",
    REQUIRE_EMAIL_VERIFICATION: "false",
    SITE_INDEXING_ENABLED: "false",
    HOTELS_ENABLED: "false",
    WHATSAPP_LIVE_SEND_APPROVED: "false",
    WHATSAPP_PROVISION_APPROVED: "false",
  })
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n"),
  { mode: 0o600 },
);
await writeFile(".dev.vars", `PUBLIC_ORIGIN=${JSON.stringify(origin)}\n`, {
  mode: 0o600,
});
console.log(
  "Local-only Cloudflare test configuration written; no production credentials used.",
);
