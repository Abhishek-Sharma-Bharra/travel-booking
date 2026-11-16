import type { D1Database } from "@cloudflare/workers-types";
import { AsyncLocalStorage } from "node:async_hooks";
export type RequestResources = {
  databaseUrl: string;
  databaseEngine?: "postgresql" | "d1";
  d1?: D1Database;
  values: Map<symbol, unknown>;
  cleanup: Array<() => Promise<void>>;
};
const key = Symbol.for("travelos.request-resources");
const shared = globalThis as unknown as Record<
  symbol,
  AsyncLocalStorage<RequestResources>
>;
export const requestResources = (shared[key] ??=
  new AsyncLocalStorage<RequestResources>());
export async function closeResources(resources: RequestResources) {
  await Promise.all(resources.cleanup.splice(0).map((close) => close()));
}
