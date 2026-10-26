import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOperator } from "@/lib/operator-access";
import { db } from "@/lib/db";
import Admin from "@/components/admin";
export const dynamic = "force-dynamic";
export default async function Page() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect("/login");
  await requireOperator(s.user.id, s.session.token).catch((e) => {
    if (
      (e as Error).message ===
      "Verify your authenticator again to manage client subscriptions"
    )
      redirect("/two-factor?next=admin");
    notFound();
  });
  const agencies = await db.agency.findMany({
    where: { demo: false },
    select: {
      id: true,
      name: true,
      plan: true,
      subscription: true,
      trialEndsAt: true,
      subscriptionExpiresAt: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return <Admin initial={JSON.parse(JSON.stringify(agencies))} />;
}
