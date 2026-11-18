import Link from "next/link";
import { notFound } from "next/navigation";
import { publicHotel } from "@/lib/hotels/booking";
import HotelStayAgent from "@/components/hotel-stay-agent";
import { HotelBrandHeader } from "@/components/hotel-brand";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Hotel room booking | Vashisht TravelOS",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  if (
    process.env.HOTEL_BOOKING_ENABLED !== "true" ||
    process.env.HOTELS_ENABLED !== "true"
  )
    notFound();
  const { hotelId } = await params;
  let hotel;
  try {
    hotel = await publicHotel(hotelId);
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound();
    throw e;
  }
  return (
    <main className="hotel-shell hotel-branded">
      <HotelBrandHeader publicView />
      <header className="hotel-header">
        <div>
          <span className="eyebrow">VERIFIED HOTEL · DIRECT ROOM REQUESTS</span>
          <h1>{hotel.name}</h1>
          <p>
            {hotel.city}, {hotel.region} · {hotel.address}
          </p>
        </div>
        <Link href="/stays" className="btn secondary">
          Browse hotels
        </Link>
      </header>
      {hotel.photoUrls[0] && (
        <img
          src={hotel.photoUrls[0]}
          alt={hotel.name + " — property photo supplied by the hotel"}
          className="hotel-public-photo"
          referrerPolicy="no-referrer"
        />
      )}
      <p>{hotel.amenities.join(" · ")}</p>
      <p>
        Contact this hotel:{" "}
        <a href={"tel:" + hotel.contactPhone}>{hotel.contactPhone}</a> ·{" "}
        <a href={"mailto:" + hotel.contactEmail}>{hotel.contactEmail}</a>
      </p>
      <HotelStayAgent hotel={hotel} />
    </main>
  );
}
