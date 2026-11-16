import { parse } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const env = parse(await readFile(".env"));
const url = new URL(env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  throw Error("Local preview accepts only a localhost test database");
const origin = "http://localhost:3000";
await writeFile(
  "cloudflare/worker/.dev.vars",
  Object.entries({
    DATABASE_URL: env.DATABASE_URL,
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
await writeFile(
  "cloudflare/pages/.dev.vars",
  `PUBLIC_ORIGIN=${JSON.stringify(origin)}\n`,
  { mode: 0o600 },
);
console.log(
  "Local-only Cloudflare test configuration written; no production credentials used.",
);
