import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";

// Staging only. Never run PostgreSQL migrations, use Render credentials, change
// DNS, create paid resources, or copy real customer data in this release step.
await access(".open-next/worker.js");
const config = "cloudflare/worker/wrangler.jsonc";
for (const [command, ...args] of [
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
  ["npm", "run", "d1:demo:prepare"],
  [
    "npx",
    "wrangler",
    "d1",
    "execute",
    "TRAVELOS_DB",
    "--remote",
    "--config",
    config,
    "--file",
    ".local/d1-demo.sql",
  ],
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
  "Staging Worker release completed. Verify the Pages origin and signup/login before sharing. This did not migrate Render customer data.",
);
