import { launchGaps } from "../src/lib/readiness";
import { db } from "../src/lib/db";
async function main() {
  const gaps = await launchGaps();
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    gaps.push("Database connection");
  }
  if (gaps.length) {
    console.log("Launch prerequisites still missing:");
    for (const g of gaps) console.log(`- ${g}`);
    process.exitCode = 1;
  } else
    console.log(
      "Configuration and database checks passed. Separately verify real email delivery, hosted backups/restore, access review and signed service terms.",
    );
}
main().finally(() => db.$disconnect());
