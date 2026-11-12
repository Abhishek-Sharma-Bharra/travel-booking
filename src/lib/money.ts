// All persisted financial values are integer paise. Never use binary floating point to parse money.
export function paise(input: unknown): number {
  const s = String(input ?? "").trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s))
    throw new Error(
      "Enter a non-negative INR amount with at most two decimal places",
    );
  const [r, p = ""] = s.split(".");
  const value = Number(r) * 100 + Number(p.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value > 2_000_000_000)
    throw new Error("Amount exceeds the supported limit (₹2 crore)");
  return value;
}
export function quoteTotal(
  unit: number,
  travellers: number,
  discount: number,
  taxBps: number,
) {
  const subtotal = unit * travellers - discount;
  if (subtotal < 0)
    throw new Error("Discount cannot exceed the quotation subtotal");
  const total =
    subtotal + Number((BigInt(subtotal) * BigInt(taxBps) + 5000n) / 10000n);
  if (!Number.isSafeInteger(total) || total > 2_000_000_000)
    throw new Error("Quotation exceeds the supported amount");
  return total;
}
export type Entry = { kind: string; amount: number; supplier?: string };
export function balances(b: {
  total: number;
  status: string;
  cancellationFee: number;
  transactions: Entry[];
}) {
  const sum = (k: string) =>
    b.transactions
      .filter((t) => t.kind === k)
      .reduce((s, t) => s + t.amount, 0);
  const receipts = sum("Receipt"),
    refunds = sum("Refund"),
    costs = sum("Expense"),
    paid = sum("Supplier payment") - sum("Supplier refund"),
    credits = sum("Supplier credit");
  const sales = b.status === "Cancelled" ? b.cancellationFee : b.total;
  return {
    sales,
    receipts,
    refunds,
    netCash: receipts - refunds,
    customerDue: Math.max(0, sales - receipts + refunds),
    refundable: Math.max(0, receipts - refunds - sales),
    supplierCost: costs - credits,
    supplierPaid: paid,
    supplierDue: costs - credits - paid,
    contribution: sales - costs + credits,
  };
}
export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n / 100);
export const indianDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

export const indiaToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

// Markup is a percentage of cost; margin is a percentage of selling price.
export function pricedUnit(
  cost: number,
  mode: string,
  bps: number,
  recorded: number,
) {
  if (
    !Number.isSafeInteger(cost) ||
    cost < 0 ||
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps >= 10000
  )
    throw new Error("Invalid pricing inputs");
  if (
    !["Recorded selling rate", "Cost plus markup", "Target margin"].includes(
      mode,
    )
  )
    throw new Error("Invalid pricing mode");
  if (mode === "Recorded selling rate") {
    if (
      !Number.isSafeInteger(recorded) ||
      recorded < 0 ||
      recorded > 2000000000
    )
      throw new Error("Invalid recorded rate");
    return recorded;
  }
  const denominator = mode === "Target margin" ? 10000 - bps : 10000;
  const numerator =
    BigInt(cost) * BigInt(mode === "Target margin" ? 10000 : 10000 + bps);
  const result = Number(
    (numerator + BigInt(Math.floor(denominator / 2))) / BigInt(denominator),
  );
  if (!Number.isSafeInteger(result) || result > 2000000000)
    throw new Error("Pricing exceeds the supported amount");
  return result;
}
