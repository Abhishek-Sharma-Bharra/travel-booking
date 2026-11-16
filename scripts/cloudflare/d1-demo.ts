import { mkdir, writeFile } from "node:fs/promises";
import { demoFixture } from "../../src/lib/demo-fixture";
import { newD1Record, bulkInsertD1 } from "../../src/lib/d1/unit";
async function main() {
  const data = demoFixture();
  const datasets: [string, Record<string, unknown>[]][] = [
    ["Agency", [data.agency]],
    ["User", data.users],
    ["Package", data.packages],
    ["Lead", data.leads],
    ["Quote", data.quotes],
    ["Booking", data.bookings],
    ["Transaction", data.transactions],
    ["Activity", data.activities],
    ["Spend", data.spends],
  ];
  let sql =
    "-- FICTIONAL, separate read-only demo agency. No credential accounts or real contacts.\n";
  sql += `INSERT INTO "_TravelOSAtomicGuard" (id,ok) SELECT 'demo-fixture-check',CASE WHEN NOT EXISTS(SELECT 1 FROM "Agency" WHERE id='demo-agency' AND demo=0) THEN 1 ELSE 0 END;\n`;
  for (const [model, rows] of datasets) {
    for (let start = 0; start < rows.length; start += 25) {
      const records = rows
        .slice(start, start + 25)
        .map((row) => newD1Record(model, row));
      const statement = bulkInsertD1(model, records);
      const payload = String(statement.values![0]).replace(/'/g, "''");
      // A WHERE clause avoids SQLite's INSERT SELECT / ON CONFLICT ambiguity.
      sql +=
        statement.sql.replace("?", `'${payload}'`) +
        ` WHERE true ON CONFLICT ("id") DO NOTHING;\n`;
    }
  }
  sql += `DELETE FROM "_TravelOSAtomicGuard" WHERE id='demo-fixture-check';\n`;
  await mkdir(".local", { recursive: true });
  await writeFile(".local/d1-demo.sql", sql);
  console.log(
    "Prepared isolated fictional D1 demo SQL locally; no remote database accessed.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
