// Retry only explicit database rollback conditions, never timeouts or unknown
// transport errors: an unconfirmed write must not be blindly issued again.
export function transactionConflict(error: unknown) {
  const e = error as {
    code?: string;
    meta?: {
      code?: string;
      driverAdapterError?: { cause?: { originalCode?: string } };
    };
  };
  if (e?.code === "P2034") return true;
  const sqlstate =
    e?.meta?.code || e?.meta?.driverAdapterError?.cause?.originalCode;
  return e?.code === "P2010" && (sqlstate === "40001" || sqlstate === "40P01");
}
export function uniqueConflict(error: unknown) {
  const e = error as { code?: string; meta?: { code?: string } };
  return (
    e?.code === "P2002" || (e?.code === "P2010" && e?.meta?.code === "23505")
  );
}
