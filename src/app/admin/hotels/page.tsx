import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { hotelReviewQueue } from "@/lib/hotels/service";
import HotelReviewConsole from "@/components/hotel-review-console";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (process.env.HOTELS_ENABLED !== "true") notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=hotel-admin");
  const initial = await hotelReviewQueue(
    session.user.id,
    session.session.token,
  ).catch(() => null);
  if (!initial) notFound();
  return <HotelReviewConsole initial={JSON.parse(JSON.stringify(initial))} />;
}
