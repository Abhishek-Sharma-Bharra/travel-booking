import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";

// Existing Cloudflare deployment. Never run PostgreSQL migrations, use Render credentials, change
// DNS, create paid resources, or copy real customer data in this release step.
await access(".open-next/worker.js");
const config = "cloudflare/worker/wrangler.jsonc";
for (const [command, ...args] of [
  // Read-only pre-migration restore-point check. Keep the bookmark in the build
  // log; abort before schema writes if the deployment token cannot verify it.
  [
    "npx",
    "wrangler",
    "d1",
    "time-travel",
    "info",
    "TRAVELOS_DB",
    "--config",
    config,
    "--json",
  ],
  [
    "npx",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "TRAVELOS_DB",
    "--remote",
    "--config",
    config,
  ],
  // Existing demo data is retained. A release must not import test/demo fixtures.
  ["npx", "wrangler", "deploy", "--config", config],
]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "Worker release completed. Verify the Pages origin, signup/login, workspace operations and guided assistant. Paid AI remains disabled. No demo fixtures were imported.",
);
