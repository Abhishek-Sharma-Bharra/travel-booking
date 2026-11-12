// Preserve the legacy client shape at compile time while removing restricted
// fields at the serialization boundary. Financial views must also be hidden.
export function redactFinancial<T>(value: T): T {
  if (value instanceof Date || value === null || typeof value !== "object")
    return value;
  if (Array.isArray(value)) return value.map(redactFinancial) as T;
  const copy: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (
      [
        "estimatedCost",
        "rateNotes",
        "directCostsComplete",
        "costRevision",
        "adSpendRevision",
      ].includes(key)
    )
      continue;
    if (key === "transactions" && Array.isArray(v)) {
      copy[key] = v
        .filter((t) => ["Receipt", "Refund"].includes(t.kind))
        .map(redactFinancial);
      continue;
    }
    if (key === "activities" && Array.isArray(v)) {
      copy[key] = v
        .filter(
          (t) =>
            !/^(Expense|Supplier |Direct cost|Advertising coverage)/.test(
              t.action,
            ),
        )
        .map(redactFinancial);
      continue;
    }
    copy[key] = redactFinancial(v);
  }
  return copy as T;
}
