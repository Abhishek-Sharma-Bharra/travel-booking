import { defineCloudflareConfig } from "@opennextjs/cloudflare";
const config = defineCloudflareConfig({
  incrementalCache: "dummy",
  tagCache: "dummy",
  queue: "dummy",
  enableCacheInterception: false,
});

// Keep Prisma clients external until OpenNext resolves the workerd exports.
config.buildCommand = "npm run build -- --webpack";
export default config;
