import { spawnSync } from "node:child_process";
const revision =
  process.env.TRAVELOS_BUILD_ID ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim();
if (!revision || !/^[a-f0-9]{40,64}$/.test(revision))
  throw new Error("Cloudflare build requires a Git commit revision");
const env = {
  ...process.env,
  TRAVELOS_BUILD_ID: revision,
  SITE_INDEXING_ENABLED: "false",
  PUBLIC_SITE_URL: "https://travel-booking-dnn.pages.dev",
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
