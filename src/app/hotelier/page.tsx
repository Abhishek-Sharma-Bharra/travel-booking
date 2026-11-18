import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { hotelOverview } from "@/lib/hotels/service";
import HotelConsole from "@/components/hotel-console";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (process.env.HOTELS_ENABLED !== "true") notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=hotelier");
  const initial = await hotelOverview(session.user.id);
  return (
    <HotelConsole
      initial={JSON.parse(JSON.stringify(initial))}
      email={session.user.email}
    />
  );
}
