import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Compass } from "lucide-react";
import hotelLounge from "../../public/images/hotel-owner-lounge.webp";

export function HotelBrandHeader({ review = false }: { review?: boolean }) {
  return (
    <nav className="hotel-brand-nav" aria-label="Hotel workspace navigation">
      <Link href="/" className="brand" aria-label="Vashisht TravelOS home">
        <Compass size={31} />
        <span>
          Vashisht<span className="brand-sub">TRAVELOS</span>
        </span>
      </Link>
      <span className="hotel-brand-divider" />
      <span className="hotel-brand-area">
        {review ? "Platform review" : "Hotel workspace"}
      </span>
      <Link className="btn secondary" href={review ? "/admin" : "/workspace"}>
        {review ? "Platform administration" : "Agency CRM"}{" "}
        <ArrowUpRight size={15} />
      </Link>
    </nav>
  );
}

export function HotelWelcomeImage() {
  return (
    <section
      className="hotel-welcome"
      aria-label="Hotel workspace introduction"
    >
      <div className="hotel-welcome-copy">
        <span>HOSPITALITY, THOUGHTFULLY MANAGED</span>
        <h2>
          A great stay starts
          <br />
          with the details.
        </h2>
        <p>
          Your property, room categories and verification, in one familiar
          workspace.
        </p>
      </div>
      <figure className="hotel-welcome-photo">
        <Image
          src={hotelLounge}
          alt=""
          fill
          sizes="(max-width: 700px) 100vw, (max-width: 1300px) 60vw, 760px"
          placeholder="blur"
          preload
        />
        <figcaption>
          Illustrative hotel image · not a listed property
        </figcaption>
      </figure>
    </section>
  );
}
