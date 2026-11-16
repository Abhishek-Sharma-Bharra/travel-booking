import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as D1Client } from "@travelos/d1-client";
import { createSafeD1Adapter } from "./d1/adapter";
import { activeD1AuthBatch, runD1AuthBatch } from "./d1/auth-batch";
import { requestResources } from "./request-resources";
const globalDb = globalThis as unknown as { db?: PrismaClient };
const resourceKey = Symbol.for("travelos.request-database");
function createDatabase(connectionString: string | undefined, max = 5) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    }),
    errorFormat: "minimal",
    log: [],
  });
}
function client(): PrismaClient {
  const resources = requestResources.getStore();
  if (resources) {
    let value = resources.values.get(resourceKey) as PrismaClient | undefined;
    if (!value) {
      if (resources.databaseEngine === "d1") {
        if (!resources.d1) throw new Error("TRAVELOS_DB D1 binding is missing");
        value = new D1Client({
          adapter: createSafeD1Adapter(resources.d1),
          errorFormat: "minimal",
          log: [],
        }) as unknown as PrismaClient;
      } else value = createDatabase(resources.databaseUrl, 3);
      resources.values.set(resourceKey, value);
      resources.cleanup.push(() => value!.$disconnect());
    }
    return value;
  }
  if (process.env.TRAVELOS_RUNTIME === "cloudflare")
    throw new Error("Database access requires a Cloudflare request scope");
  return (globalDb.db ??= createDatabase(process.env.DATABASE_URL));
}
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const real = client();
    const batch = activeD1AuthBatch();
    const target =
      batch && typeof property === "string" && !property.startsWith("_")
        ? batch.client
        : real;
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export function d1Binding() {
  const resources = requestResources.getStore();
  if (resources?.databaseEngine !== "d1") return undefined;
  if (!resources.d1) throw new Error("TRAVELOS_DB D1 binding is missing");
  return resources.d1;
}
export async function withAuthDatabase<T>(fn: () => Promise<T>): Promise<T> {
  const binding = d1Binding();
  return binding ? runD1AuthBatch(binding, fn) : fn();
}
// Only Better Auth receives this auth-specific transaction facade. General
// application Prisma transactions remain fail-closed until explicitly ported.
export const authDatabase = new Proxy(db, {
  get(target, property) {
    if (property === "$transaction" && d1Binding())
      return (fn: (tx: PrismaClient) => Promise<unknown>) =>
        withAuthDatabase(() => fn(db));
    return Reflect.get(target, property);
  },
});
