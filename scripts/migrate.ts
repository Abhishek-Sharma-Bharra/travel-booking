// Pinned Prisma WASM engine + official PostgreSQL adapter, delivered with npm integrity checks.
// This avoids a native-engine download in restricted environments without disabling verification.
import "dotenv/config";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as glue from "@prisma/schema-engine-wasm/schema_engine_bg";
import { createRequire } from "node:module";
const wasmPath = resolve(
  createRequire(import.meta.url).resolve("@prisma/schema-engine-wasm"),
  "../schema_engine_bg.wasm",
);
import { bindMigrationAwareSqlAdapterFactory } from "@prisma/driver-adapter-utils";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const filters = { externalTables: [], externalEnums: [] };
async function main() {
  const wasmModule = await WebAssembly.compile(await readFile(wasmPath));
  const instance = await WebAssembly.instantiate(wasmModule, {
    "./schema_engine_bg.js": glue,
  });
  glue.__wbg_set_wasm(instance.exports);
  (instance.exports.__wbindgen_start as CallableFunction)();
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const pool = new pg.Pool({
    connectionString:
      process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
  });
  const engine = await glue.SchemaEngine.new(
    { datamodels: [["schema.prisma", schema]] },
    () => {},
    bindMigrationAwareSqlAdapterFactory(new PrismaPg(pool)),
  );
  try {
    if (process.argv.includes("--initial")) {
      const result = await engine.diff({
        from: { tag: "empty" },
        to: {
          tag: "schemaDatamodel",
          files: [{ path: "schema.prisma", content: schema }],
        },
        script: true,
        exitCode: null,
        filters,
      });
      await mkdir("prisma/migrations/20261024000000_initial", {
        recursive: true,
      });
      await writeFile(
        "prisma/migrations/20261024000000_initial/migration.sql",
        result.stdout!,
      );
      await writeFile(
        "prisma/migrations/migration_lock.toml",
        'provider = "postgresql"\n',
      );
    }
    const baseDir = resolve("prisma/migrations");
    const dirs = (await readdir(baseDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const migrationDirectories = await Promise.all(
      dirs.map(async (path) => ({
        path,
        migrationFile: {
          path: "migration.sql",
          content: {
            tag: "ok" as const,
            value: await readFile(`${baseDir}/${path}/migration.sql`, "utf8"),
          },
        },
      })),
    );
    const result = await engine.applyMigrations({
      migrationsList: {
        baseDir,
        lockfile: {
          path: "migration_lock.toml",
          content: await readFile(`${baseDir}/migration_lock.toml`, "utf8"),
        },
        shadowDbInitScript: "",
        migrationDirectories,
      },
      filters,
    });
    console.log(result);
  } finally {
    engine.free();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
