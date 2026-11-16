// Schema-only preparation against disposable LOCAL D1. Never connects remotely.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import * as glue from "@prisma/schema-engine-wasm/schema_engine_bg";
import { bindMigrationAwareSqlAdapterFactory } from "@prisma/driver-adapter-utils";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getDMMF } from "@prisma/internals";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const checks: Record<string, string[]> = {
  User: [`"role" IN ('OWNER','MANAGER','AGENT')`],
  Invitation: [`"role" IN ('MANAGER','AGENT')`],
  Transaction: [
    `"amount">0`,
    `"kind" IN ('Receipt','Refund','Expense','Supplier payment','Supplier credit','Supplier refund')`,
    `"dateBasis" IN ('CALENDAR','INSTANT')`,
  ],
  IntegrationConnection: [`"provider" IN ('META','GOOGLE')`],
  AdDailyMetric: [`"spendMicros">=0`, `"impressions">=0`, `"clicks">=0`],
  TourProgress: [`"step">=0`, `"status" IN ('ACTIVE','SKIPPED','COMPLETE')`],
  Hotel: [
    `"taxBps" BETWEEN 0 AND 10000`,
    `"status" IN ('DRAFT','PENDING','APPROVED','REJECTED','SUSPENDED')`,
    `"revision">=0`,
    `json_type("amenities")='array'`,
    `json_type("photoUrls")='array'`,
  ],
  HotelMember: [`"role" IN ('OWNER','MANAGER','VIEWER')`],
  HotelRoomCategory: [
    `"totalRooms" BETWEEN 1 AND 10000`,
    `"maxAdults" BETWEEN 1 AND 20`,
    `"maxChildren" BETWEEN 0 AND 20`,
    `"maxOccupancy" BETWEEN 1 AND 20 AND "maxOccupancy">="maxAdults" AND "maxOccupancy">="maxChildren" AND "maxOccupancy"<="maxAdults"+"maxChildren"`,
    `json_type("amenities")='array'`,
  ],
};

export async function generateD1Schema() {
  const source = await readFile("prisma/schema.prisma", "utf8");
  const schema = source
    .replace('provider = "postgresql"', 'provider = "sqlite"')
    .replace(
      'provider = "prisma-client-js"',
      'provider = "prisma-client-js"\n  output = "../../.local/d1-client"',
    )
    .replace(/String\[\] @default\(\[\]\)/g, 'Json @default("[]")')
    .replace(
      "@default(dbgenerated(\"(now() + interval '14 days')\"))",
      "@default(dbgenerated(\"(datetime('now', '+14 days'))\"))",
    );
  const dmmf = await getDMMF({ datamodel: schema });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        'export default {fetch(){return new Response("schema preparation only")}}',
      compatibilityDate: "2026-11-16",
      d1Databases: { DB: "travelos-schema-local-only" },
    }),
  );
  try {
    const localDb = await mf.getD1Database("DB");
    const wasmPath = resolve(
      createRequire(import.meta.url).resolve("@prisma/schema-engine-wasm"),
      "../schema_engine_bg.wasm",
    );
    const wasm = await WebAssembly.instantiate(
      await WebAssembly.compile(await readFile(wasmPath)),
      { "./schema_engine_bg.js": glue },
    );
    glue.__wbg_set_wasm(wasm.exports);
    (wasm.exports.__wbindgen_start as CallableFunction)();
    const factory = new PrismaD1(localDb);
    const migrationFactory = {
      provider: "sqlite" as const,
      adapterName: factory.adapterName,
      connect: () => factory.connect(),
      connectToShadowDb: async () => {
        throw new Error("Schema preparation must not create a shadow database");
      },
    };
    const engine = await glue.SchemaEngine.new(
      { datamodels: [["schema.prisma", schema]] },
      () => {},
      bindMigrationAwareSqlAdapterFactory(migrationFactory),
    );
    let sql: string;
    try {
      const result = await engine.diff({
        from: { tag: "empty" },
        to: {
          tag: "schemaDatamodel",
          files: [{ path: "schema.prisma", content: schema }],
        },
        script: true,
        exitCode: null,
        filters: { externalTables: [], externalEnums: [] },
      });
      if (!result.stdout) throw Error("Prisma produced no SQLite schema");
      sql = result.stdout;
    } finally {
      engine.free();
    }
    // Preserve custom PostgreSQL migration invariants missing from Prisma DSL.
    for (const model of dmmf.datamodel.models) {
      const rules = [...(checks[model.name] ?? [])];
      for (const field of model.fields.filter((f) => f.kind === "scalar")) {
        if (field.type === "Json")
          rules.push(`"${field.name}" IS NULL OR json_valid("${field.name}")`);
        if (field.type === "Boolean") rules.push(`"${field.name}" IN (0,1)`);
        if (field.type === "Int")
          rules.push(`"${field.name}" BETWEEN -2147483648 AND 2147483647`);
        // D1's JS binding cannot round-trip integers outside Number's safe range.
        if (field.type === "BigInt")
          rules.push(
            `"${field.name}" BETWEEN -9007199254740991 AND 9007199254740991`,
          );
      }
      if (!rules.length) continue;
      const pattern = new RegExp(
        `CREATE TABLE "${model.name}" \\(([\\s\\S]*?)\\n\\);`,
      );
      if (!pattern.test(sql))
        throw Error(`Cannot attach constraints for ${model.name}`);
      sql = sql.replace(
        pattern,
        (_all, body: string) =>
          `CREATE TABLE "${model.name}" (${body},\n${rules.map((rule) => `    CHECK (${rule})`).join(",\n")}\n);`,
      );
    }
    const triggers = await readFile("cloudflare/d1/invariants.sql", "utf8");
    return {
      schema,
      sql: `-- Fresh D1 schema only; do not execute against PostgreSQL.\n-- Application runtime port is still in progress.\n${sql}\n${triggers}\n`,
      models: dmmf.datamodel.models.length,
    };
  } finally {
    await mf.dispose();
  }
}
async function main() {
  const result = await generateD1Schema();
  const files: [string, string][] = [
    ["cloudflare/d1/schema.prisma", result.schema],
    ["cloudflare/d1/migrations/0001_initial.sql", result.sql],
  ];
  for (const [path, contents] of files) {
    if (process.argv.includes("--check")) {
      if ((await readFile(path, "utf8")) !== contents)
        throw Error(`${path} is stale; run npm run d1:schema`);
    } else await writeFile(path, contents);
  }
  console.log(
    `D1 schema ${process.argv.includes("--check") ? "verified" : "generated"}: ${result.models} models; no remote database accessed.`,
  );
}
if (process.argv[1]?.endsWith("d1-schema.ts"))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
