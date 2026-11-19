import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOperator } from "@/lib/operator-access";
import { adminDashboard } from "@/lib/marketplace/admin";
import MarketplaceAdmin from "@/components/marketplace-admin";
export const dynamic = "force-dynamic";
export default async function Page() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect("/login?next=marketplace-admin");
  await requireOperator(s.user.id, s.session.token).catch((e) => {
    if ((e as Error).message.includes("Verify your authenticator again"))
      redirect("/two-factor?next=marketplace-admin");
    notFound();
  });
  return (
    <MarketplaceAdmin
      initial={JSON.parse(
        JSON.stringify(await adminDashboard(s.user.id, s.session.token)),
      )}
    />
  );
}
