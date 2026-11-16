import { PrismaD1 } from "@prisma/adapter-d1";
import type { D1Database } from "@cloudflare/workers-types";

// Prisma's default D1 adapter warns and ignores transaction boundaries. Fail
// closed instead: every multi-record write must be explicitly ported to batch().
// Core D1 paths use explicit native batches; unported integrations stay disabled.
export function createSafeD1Adapter(binding: D1Database) {
  const factory = new PrismaD1(binding);
  const connect = factory.connect.bind(factory);
  factory.connect = async () => {
    const adapter = await connect();
    adapter.startTransaction = async () => {
      throw new Error(
        "D1 interactive transactions are disabled; use a reviewed atomic D1 batch",
      );
    };
    return adapter;
  };
  return factory;
}
