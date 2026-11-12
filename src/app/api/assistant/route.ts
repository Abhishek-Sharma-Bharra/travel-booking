import { z } from "zod";
import { actor } from "@/lib/session";
import { db } from "@/lib/db";
import {
  jsonBody,
  sameOrigin,
  privateHeaders,
  errorResponse,
  HttpError,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { requireSubscription } from "@/lib/subscriptions";
import { extractMessage, minimiseMessage } from "@/lib/ai-provider";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    const agency = await db.agency.findUniqueOrThrow({
      where: { id: a.agencyId },
    });
    if (agency.demo) throw new HttpError(403, "Demo is read-only");
    requireSubscription(agency);
    const { message } = z
      .object({ message: z.string().trim().min(5).max(4000) })
      .parse(await jsonBody(req, 16000));
    if (
      /passport|aadhaar|aadhar|credit card|debit card|cvv|bank account/i.test(
        message,
      )
    )
      throw new HttpError(
        400,
        "Remove passport, identity-document and payment details before using AI.",
      );
    await limitRequests(`ai:user:${a.id}`, 10, 3600);
    await limitRequests(`ai:agency:${a.agencyId}`, 50, 86400);
    const draft = await extractMessage(minimiseMessage(message));
    await db.activity.create({
      data: {
        agencyId: a.agencyId,
        actor: a.id,
        action: `AI enquiry draft generated; provider OpenAI; model ${process.env.AI_MODEL || "gpt-4.1-mini"}; schema v1; no enquiry saved`,
      },
    });
    return Response.json(
      { draft, mode: "Live AI draft — review required" },
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
