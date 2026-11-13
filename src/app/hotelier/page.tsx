import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { hotelOverview } from "@/lib/hotels/service";
import { HotelBrandHeader } from "@/components/hotel-brand";
import HotelConsole from "@/components/hotel-console";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (process.env.HOTELS_ENABLED !== "true") notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=hotelier");
  if (!session.user.emailVerified)
    return (
      <main className="hotel-shell hotel-branded">
        <HotelBrandHeader />
        <h1>Verify your email first</h1>
        <p>
          A verified account is required before hotel registration. Use the
          verification email sent at signup, or request a fresh link from sign
          in.
        </p>
        <Link className="btn secondary" href="/login?next=hotelier">
          Sign in and resend verification
        </Link>
      </main>
    );
  const initial = await hotelOverview(session.user.id);
  return (
    <HotelConsole
      initial={JSON.parse(JSON.stringify(initial))}
      email={session.user.email}
    />
  );
}
