import { z } from "zod";
import {
  authorizeRunner,
  scheduleAutomation,
  runOne,
} from "@/lib/automation/service";
import { jsonBody, privateHeaders, errorResponse } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export async function POST(req: Request) {
  try {
    authorizeRunner(req.headers.get("authorization"));
    await limitRequests("automation-runner", 120);
    const v = z
      .object({
        cursor: z.string().max(200).default(""),
        schedule: z.boolean().default(true),
      })
      .parse(await jsonBody(req, 2000));
    const schedule = v.schedule ? await scheduleAutomation(v.cursor) : null;
    return Response.json(
      { schedule, execution: await runOne() },
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
