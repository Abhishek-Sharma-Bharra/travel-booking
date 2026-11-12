import { createHash } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./http";
// Atomic, shared PostgreSQL window. Keys are hashes; no raw IP/email values are stored.
export async function limitRequests(
  key: string,
  max = 120,
  windowSeconds = 60,
) {
  const now = new Date(),
    expiresAt = new Date(+now + windowSeconds * 1000),
    hashed = createHash("sha256").update(key).digest("hex");
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RequestBucket" ("key","count","expiresAt") VALUES (${hashed},1,${expiresAt}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RequestBucket"."expiresAt"<=${now} THEN 1 ELSE "RequestBucket"."count"+1 END,"expiresAt"=CASE WHEN "RequestBucket"."expiresAt"<=${now} THEN ${expiresAt} ELSE "RequestBucket"."expiresAt" END RETURNING "count"`;
  if (rows[0].count > max)
    throw new HttpError(
      429,
      "Too many requests. Please wait a minute and retry.",
      { "Retry-After": String(windowSeconds) },
    );
}
