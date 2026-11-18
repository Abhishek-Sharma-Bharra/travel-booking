import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import {
  requestResources,
  closeResources,
} from "../../src/lib/request-resources";
/** Run the same provider/security contracts against both native database paths. */
export function advertisingTest(name: string, fn: () => Promise<void> | void) {
  test("postgres: " + name, fn);
  nativeAdvertisingTest(name, fn);
}
export function nativeAdvertisingTest(
  name: string,
  fn: () => Promise<void> | void,
) {
  test("d1: " + name, async () => {
    process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: 'export default {fetch(){return new Response("fixture")}}',
        compatibilityDate: "2026-11-16",
        d1Databases: { DB: "advertising-contracts" },
      }),
    );
    try {
      const binding = (await mf.getD1Database("DB")) as unknown as D1Database;
      const { unstable_splitSqlQuery } = await import("wrangler");
      for (const file of (await readdir("cloudflare/d1/migrations"))
        .filter((n) => n.endsWith(".sql"))
        .sort()) {
        await binding.batch(
          unstable_splitSqlQuery(
            await readFile("cloudflare/d1/migrations/" + file, "utf8"),
          ).map((sql) => binding.prepare(sql)),
        );
      }
      const scope = {
        databaseUrl: "",
        databaseEngine: "d1" as const,
        d1: binding,
        values: new Map<symbol, unknown>(),
        cleanup: [] as (() => Promise<void>)[],
      };
      await requestResources.run(scope, async () => {
        try {
          await fn();
        } finally {
          await closeResources(scope);
        }
      });
    } finally {
      await mf.dispose();
    }
  });
}
