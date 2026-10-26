import { verificationRequired } from "./mail";
import { HttpError } from "./http";
import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
import { Actor } from "./access";
export async function actor(): Promise<Actor> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Please sign in");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { agency: true },
  });
  if (!user?.agencyId || user.disabled || user.agency?.demo)
    throw new HttpError(403, "Workspace access unavailable");
  if (verificationRequired() && !user.emailVerified)
    throw new HttpError(
      403,
      "Verify your email before accessing the workspace",
    );
  return { id: user.id, agencyId: user.agencyId, role: user.role };
}
