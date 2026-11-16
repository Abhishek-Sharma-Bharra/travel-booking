import { spawnSync } from "node:child_process";
const env = {
  ...process.env,
  SITE_INDEXING_ENABLED: "false",
  PUBLIC_SITE_URL: "https://vashisht-travelos-staging.pages.dev",
};
for (const args of [
  ["opennextjs-cloudflare", "build", "-c", "cloudflare/worker/wrangler.jsonc"],
  ["node", "scripts/cloudflare/assets.mjs"],
]) {
  const [command, ...rest] = args;
  const result = spawnSync(command, rest, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
