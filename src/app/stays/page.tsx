import Link from "next/link";
import { notFound } from "next/navigation";
import { publicHotels } from "@/lib/hotels/booking";
import { HotelBrandHeader } from "@/components/hotel-brand";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Verified hotels | Vashisht TravelOS",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string }>;
}) {
  if (
    process.env.HOTEL_BOOKING_ENABLED !== "true" ||
    process.env.HOTELS_ENABLED !== "true"
  )
    notFound();
  const q = await searchParams,
    hotels = await publicHotels(q.destination || "");
  return (
    <main className="hotel-shell hotel-branded">
      <HotelBrandHeader publicView />
      <header className="hotel-header">
        <div>
          <span className="eyebrow">FIND YOUR NEXT STAY</span>
          <h1>Hotels, thoughtfully connected.</h1>
          <p>
            Verified properties. Hotel-managed availability. A clear view of the
            final price.
          </p>
        </div>
      </header>
      <form className="hotel-inventory-form">
        <label>
          Destination
          <input
            name="destination"
            defaultValue={q.destination || ""}
            maxLength={100}
            placeholder="City"
          />
        </label>
        <button className="btn primary">Search hotels</button>
      </form>
      <div className="hotel-booking-grid">
        {hotels.map((h) => (
          <article className="panel" key={h.id}>
            {h.photoUrls[0] && (
              <img
                src={h.photoUrls[0]}
                alt={h.name + " — property photo supplied by the hotel"}
                className="hotel-public-photo"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )}
            <h2>{h.name}</h2>
            <p>
              {h.city}, {h.region}
            </p>
            <p>{h.amenities.join(" · ")}</p>
            <Link href={"/stays/" + h.id} className="btn secondary">
              View rooms and availability
            </Link>
          </article>
        ))}
      </div>
      {!hotels.length && (
        <p>No verified properties match this destination yet.</p>
      )}
    </main>
  );
}
