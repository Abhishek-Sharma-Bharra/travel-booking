import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
await rm("cloudflare/pages-dist", { recursive: true, force: true });
await mkdir("cloudflare/pages-dist", { recursive: true });
await cp(".open-next/assets", "cloudflare/pages-dist", { recursive: true });
await build({
  entryPoints: ["cloudflare/pages/gateway.ts"],
  outfile: "cloudflare/pages-dist/_worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
await writeFile(
  "cloudflare/pages-dist/_routes.json",
  JSON.stringify({ version: 1, include: ["/*"], exclude: [] }),
);
