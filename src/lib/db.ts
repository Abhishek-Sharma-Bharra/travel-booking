import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
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
      value = createDatabase(resources.databaseUrl, 3);
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
    const target = client();
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
