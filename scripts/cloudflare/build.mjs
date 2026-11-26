import { spawnSync } from "node:child_process";
import { unstable_readConfig } from "wrangler";
const workerConfig = unstable_readConfig({
  config: "cloudflare/worker/wrangler.jsonc",
});
const revision =
  process.env.TRAVELOS_BUILD_ID ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim();
if (!revision || !/^[a-f0-9]{40,64}$/.test(revision))
  throw new Error("Cloudflare build requires a Git commit revision");
const env = {
  ...process.env,
  TRAVELOS_BUILD_ID: revision,
  TRAVELOS_BUILD_DATABASE_ENGINE: String(
    workerConfig.vars.TRAVELOS_DATABASE_ENGINE ?? "postgresql",
  ),
  // Keep prerendered navigation aligned with the runtime feature flags.
  HOTELS_ENABLED: String(workerConfig.vars.HOTELS_ENABLED ?? "false"),
  HOTEL_BOOKING_ENABLED: String(
    workerConfig.vars.HOTEL_BOOKING_ENABLED ?? "false",
  ),
  SITE_INDEXING_ENABLED: "false",
  PUBLIC_SITE_URL: "https://travel-booking-dnn.pages.dev",
};
for (const args of [
  ["opennextjs-cloudflare", "build", "-c", "cloudflare/worker/wrangler.jsonc"],
  ["node", "scripts/cloudflare/assets.mjs"],
  ["node", "scripts/cloudflare/check-worker-size.mjs"],
]) {
  const [command, ...rest] = args;
  const result = spawnSync(command, rest, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
