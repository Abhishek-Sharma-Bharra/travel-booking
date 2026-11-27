import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
// Fixed localhost target: this command never load-tests a production origin.
const origin = "http://localhost:3000";
const start = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const end = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
const paths = [
  "/",
  "/hotel-business",
  "/marketplace",
  "/stays",
  "/api/health/live",
  `/api/marketplace/public?kind=BUS&city=delhi&start=${start}&end=${end}`,
  `/api/marketplace/public?kind=HOTEL&city=delhi&start=${start}&end=${end}`,
];
function get(path, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const request = http.get(origin + path, (response) => {
      response.resume();
      response.on("end", () =>
        resolve({
          path,
          status: response.statusCode,
          wallMs: Math.round(performance.now() - start),
          json: /application\/json/i.test(
            response.headers["content-type"] || "",
          ),
        }),
      );
    });
    request.setTimeout(timeout, () =>
      request.destroy(new Error("Local request timeout")),
    );
    request.on("error", reject);
  });
}
const deadline = Date.now() + 30000;
let ready = false;
while (Date.now() < deadline) {
  try {
    if ((await get("/api/health/live", 2000)).status === 200) {
      ready = true;
      break;
    }
  } catch {}
  await delay(500);
}
if (!ready)
  throw new Error(
    "Local Pages/private Worker are not ready. Start both services with the existing local D1 test configuration.",
  );
const queue = [...paths, ...paths],
  results = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) results.push(await get(queue.shift()));
  }),
);
const failures = results.filter(
  (r) => r.status !== 200 || (r.path.startsWith("/api/") && !r.json),
);
console.log(
  JSON.stringify(
    {
      localOnly: true,
      requests: results.length,
      concurrency: 4,
      failures,
      wallMs: {
        min: Math.min(...results.map((r) => r.wallMs)),
        max: Math.max(...results.map((r) => r.wallMs)),
      },
      note: "Bounded local smoke only; not CPU measurements, production capacity or a latency SLA.",
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
