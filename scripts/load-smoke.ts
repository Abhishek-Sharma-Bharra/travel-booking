import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
async function main() {
  const host = new URL(process.env.DATABASE_URL || "").hostname;
  if (!["localhost", "127.0.0.1"].includes(host))
    throw Error("Load smoke requires local PostgreSQL");
  const origin = "http://127.0.0.1:3105",
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3105",
      ],
      { env: { ...process.env, BETTER_AUTH_URL: origin }, stdio: "ignore" },
    );
  const deadline = Date.now() + 30000;
  let exited = false;
  server.once("exit", () => {
    exited = true;
  });
  try {
    while (true) {
      if (exited) throw Error("Local server exited");
      try {
        const r = await fetch(origin + "/api/health/live", {
          signal: AbortSignal.timeout(1000),
        });
        if (r.ok) break;
      } catch {}
      if (Date.now() > deadline)
        throw Error("Local server did not become live");
      await new Promise((r) => setTimeout(r, 200));
    }
    const endpoints = [
      { path: "/demo", status: 200 },
      {
        path: "/api/analytics?demo=1&from=2026-01-01&to=2026-11-11",
        status: 200,
      },
      { path: "/api/health/live", status: 200 },
      { path: "/api/automation", status: 401 },
      { path: "/api/messaging", status: 401 },
    ];
    const rows: {
      path: string;
      status: number;
      expected: number;
      elapsedMs: number;
    }[] = [];
    let index = 0;
    const began = Date.now();
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (index < 80) {
          const n = index++,
            endpoint = endpoints[n % endpoints.length],
            start = performance.now();
          const response = await fetch(origin + endpoint.path, {
            signal: AbortSignal.timeout(15000),
          });
          await response.arrayBuffer();
          rows.push({
            path: endpoint.path,
            status: response.status,
            expected: endpoint.status,
            elapsedMs: Math.round(performance.now() - start),
          });
        }
      }),
    );
    const unexpected = rows.filter((r) => r.status !== r.expected),
      p95 = percentile(
        rows.map((r) => r.elapsedMs),
        0.95,
      );
    const report = {
      performedAt: new Date().toISOString(),
      scope:
        "Local Node production build, localhost PostgreSQL, seeded demo; not hosted capacity certification",
      requests: rows.length,
      concurrency: 8,
      unexpectedStatuses: unexpected.length,
      p50Ms: percentile(
        rows.map((r) => r.elapsedMs),
        0.5,
      ),
      p95Ms: p95,
      maxMs: Math.max(...rows.map((r) => r.elapsedMs)),
      elapsedMs: Date.now() - began,
      result: unexpected.length === 0 && p95 < 5000 ? "PASS" : "FAIL",
      endpoints: endpoints.map((e) => ({
        path: e.path,
        expectedStatus: e.status,
        requests: rows.filter((r) => r.path === e.path).length,
      })),
    };
    await mkdir(".local/release-checks", { recursive: true });
    await writeFile(
      ".local/release-checks/load-smoke.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
    if (report.result !== "PASS") process.exitCode = 1;
  } finally {
    server.kill("SIGTERM");
  }
}
main().catch(() => {
  console.error("Local load smoke failed. No production URL was targeted.");
  process.exitCode = 1;
});
