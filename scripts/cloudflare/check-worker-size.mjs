import { spawnSync } from "node:child_process";
const budget = Number(process.env.TRAVELOS_WORKER_GZIP_BUDGET_KIB || 3072);
if (!Number.isSafeInteger(budget) || budget < 1024 || budget > 10240)
  throw new Error(
    "Worker gzip budget must be an explicit integer between 1024 and 10240 KiB",
  );
const result = spawnSync(
  "npx",
  [
    "wrangler",
    "deploy",
    "-c",
    "cloudflare/worker/wrangler.jsonc",
    "--dry-run",
    "--outdir",
    ".local/worker-size-check",
  ],
  { encoding: "utf8", env: process.env, maxBuffer: 4 * 1024 * 1024 },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(
    result.stderr || result.stdout || "Worker size dry run failed",
  );
  process.exit(result.status ?? 1);
}
const output = (result.stdout || "").replace(/\u001b\[[0-9;]*m/g, "");
const match = /Total Upload:[^\n]*gzip:\s*([\d.]+)\s*KiB/.exec(output);
if (!match)
  throw new Error(
    "Wrangler did not report a gzip size; refusing to skip the build budget check",
  );
const size = Number(match[1]);
if (!Number.isFinite(size) || size > budget)
  throw new Error(
    `Worker gzip ${size.toFixed(2)} KiB exceeds this project's ${budget} KiB budget. Optimise the build or review deployment requirements; no paid infrastructure was activated.`,
  );
console.log(
  `Worker gzip budget passed: ${size.toFixed(2)} / ${budget} KiB. Dry run only; nothing deployed.`,
);
