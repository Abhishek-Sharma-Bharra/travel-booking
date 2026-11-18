import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  CalendarDays,
  MessageSquare,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { MarketingHeader, MarketingFooter } from "@/components/marketing";
import { HotelWelcomeImage } from "@/components/hotel-brand";
import { publicMetadata, publicContactEmail } from "@/lib/seo";
export const metadata = publicMetadata(
  "/hotel-business",
  "Hotel Owner Software & Room Booking Workspace | Vashisht TravelOS",
  "A dedicated Vashisht TravelOS workspace for hotel owners to list properties, manage room availability and rates, and handle guest enquiries and reservations.",
);
export default function HotelBusiness() {
  if (process.env.HOTELS_ENABLED !== "true") notFound();
  const email = publicContactEmail();
  return (
    <main className="landing hotel-business-landing hotel-branded">
      <MarketingHeader path="/hotel-business" audience="hotel" />
      <section className="hotel-business-intro">
        <span className="eyebrow">FOR HOTEL OWNERS &amp; PROPERTY TEAMS</span>
        <h1>
          Your property.
          <br />
          <em>Your hotel workspace.</em>
        </h1>
        <p>
          List your rooms, manage rates and availability, and bring guest
          conversations and reservations together. A dedicated space for your
          hotel team.
        </p>
        <div className="hero-actions">
          <Link href="/login?next=hotelier" className="btn primary">
            Hotel owner sign in <ArrowUpRight size={17} />
          </Link>
          <Link href="/login?signup=1&next=hotelier" className="btn secondary">
            Register your hotel
          </Link>
        </div>
        <p className="business-entry-note">
          <Check size={15} /> Hotel owners manage properties here. Travel
          agencies use the <Link href="/">travel agency CRM</Link>.
        </p>
      </section>
      <HotelWelcomeImage />
      <section
        id="hotel-features"
        className="business-feature-grid"
        aria-label="Hotel owner features"
      >
        {[
          [
            Building2,
            "Your property & rooms",
            "Add your hotel details, amenities, approved photos and room categories. Complete verification before your public listing opens.",
          ],
          [
            CalendarDays,
            "Your rates & availability",
            "Set date-wise room allotments and prices, minimum stays and blackout dates. Keep inventory aligned with your other booking channels.",
          ],
          [
            MessageSquare,
            "Your guests & reservations",
            "Share your hotel page in ads, respond to guest enquiries and track room holds and payment status. AI and checkout need onboarding and configuration.",
          ],
        ].map(([Icon, title, copy]) => {
          const FeatureIcon = Icon as typeof Building2;
          return (
            <article className="marketing-card" key={String(title)}>
              <FeatureIcon size={25} />
              <h2>{String(title)}</h2>
              <p>{String(copy)}</p>
            </article>
          );
        })}
      </section>
      <section id="how-it-works" className="marketing-callout">
        <span className="eyebrow">A CLEAR START FOR YOUR HOTEL</span>
        <h2>Register. Verify. Welcome your guests.</h2>
        <p>
          Create or sign in to your account, verify your email, add your
          property and rooms, and submit for independent approval. Then set
          available room allotments and share your hotel's guest booking page.
        </p>
        <div className="hero-actions">
          <Link href="/hotelier" className="btn primary">
            Open hotel dashboard <ArrowUpRight size={17} />
          </Link>
          {email && (
            <a
              href={
                "mailto:" + email + "?subject=TravelOS%20hotel%20onboarding"
              }
              className="btn secondary"
            >
              Discuss hotel onboarding
            </a>
          )}
        </div>
      </section>
      {process.env.HOTEL_BOOKING_ENABLED === "true" && (
        <section className="business-guest-callout">
          <div>
            <span className="eyebrow">LOOKING FOR A ROOM?</span>
            <h2>Guests have their own booking pages.</h2>
            <p>You don't need a hotel-owner account to enquire about a stay.</p>
          </div>
          <Link href="/stays" className="btn secondary">
            Find a hotel · for guests <ArrowUpRight size={16} />
          </Link>
        </section>
      )}
      <MarketingFooter />
    </main>
  );
}
