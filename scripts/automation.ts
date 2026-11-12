import "dotenv/config";
import { scheduleAutomation, runOne } from "../src/lib/automation/service";
import { db } from "../src/lib/db";
async function main() {
  let cursor = "";
  for (let i = 0; i < 100; i++) {
    const s = await scheduleAutomation(cursor);
    if (!s.nextCursor) break;
    cursor = s.nextCursor;
  }
  for (let i = 0; i < 10; i++) {
    const r = await runOne();
    console.log(r);
    if (r.status === "IDLE") break;
  }
}
main()
  .catch(() => {
    console.error(
      "Automation runner failed; inspect sanitized agency execution logs.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
