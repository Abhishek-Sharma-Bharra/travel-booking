import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import MarketplaceConsole from "@/components/marketplace-console";
import { ownDashboard } from "@/lib/marketplace/business";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const requested = (await searchParams).kind;
  const preferredKind =
    requested === "CAR" || requested === "BUS" || requested === "HOTEL"
      ? requested
      : undefined;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=operator");
  const data = await ownDashboard(session.user.id);
  return (
    <MarketplaceConsole
      initial={JSON.parse(JSON.stringify(data))}
      preferredKind={preferredKind}
    />
  );
}
