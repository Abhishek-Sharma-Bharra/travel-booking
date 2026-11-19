import Link from "next/link";
import Image from "next/image";
import MarketplacePricing from "@/components/marketplace-pricing";
import {
  ArrowUpRight,
  Check,
  Building2,
  BriefcaseBusiness,
  Bus,
  Car,
} from "lucide-react";
import { MarketingHeader, MarketingFooter } from "@/components/marketing";
import { publicMetadata, publicOrigin } from "@/lib/seo";
export const metadata = publicMetadata(
  "/",
  "Travel Agency CRM & Booking Management | Vashisht TravelOS",
  "Manage travel agency enquiries, quotations, bookings, manual payment records and analytics with Vashisht TravelOS. Explore a fictional read-only demo.",
);
export default function Home() {
  return (
    <main className="landing">
      <MarketingHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": `${publicOrigin()}/#organization`,
                name: "Vashisht TravelOS",
                url: publicOrigin(),
              },
              {
                "@type": "SoftwareApplication",
                name: "Vashisht TravelOS",
                url: publicOrigin(),
                applicationCategory: "BusinessApplication",
                operatingSystem: "Web browser",
                description:
                  "Travel agency CRM for enquiries, quotations, bookings, manual payment records and analytics.",
                publisher: { "@id": `${publicOrigin()}/#organization` },
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
      <section className="hero">
        <div>
          <span className="eyebrow">
            <span className="live-dot" /> YOUR BUSINESS, CONNECTED
          </span>
          <p className="hero-product-category">
            Travel CRM, hotel stays &amp; vehicle charter operations
          </p>
          <h1>
            Less admin.
            <br />
            More <em>adventure.</em>
          </h1>
          <p>
            Vashisht TravelOS brings travel enquiries, packages, quotations,
            bookings and collections together. Hotel, bus and car businesses can
            manage inventory and supplier requests in their own workspace, all
            within one connected platform.
          </p>
          <div className="hero-actions">
            <Link href="/demo" className="btn primary">
              Explore Demo <ArrowUpRight size={18} />
            </Link>
            <Link href="#workspaces" className="btn secondary">
              Choose your workspace
            </Link>
          </div>
          <div className="hero-note">
            <Check size={16} /> No credit card needed to explore · Fictional
            demo data
          </div>
        </div>
        <figure className="operations-visual">
          <Image
            src="/images/travel-operations.webp"
            alt="Travel coordinators planning itineraries and managing daily agency operations"
            width={1200}
            height={800}
            priority
            unoptimized
          />
          <figcaption>
            <strong>From enquiry to itinerary.</strong>
            <span>A clearer way to manage your daily operations.</span>
          </figcaption>
        </figure>
      </section>
      <section
        id="workspaces"
        className="workspace-selection"
        aria-labelledby="workspace-title"
      >
        <span className="eyebrow">BUILT AROUND YOUR BUSINESS</span>
        <h2 id="workspace-title">Choose your workspace</h2>
        <p>One platform. A dedicated starting point for your business.</p>
        <nav
          className="workspace-cards"
          aria-label="Choose your business workspace"
        >
          <article>
            <BriefcaseBusiness size={28} />
            <h3>Travel agencies</h3>
            <p>
              Manage enquiries, packages, quotations, bookings, collections and
              reports.
            </p>
            <Link className="btn primary" href="/login?signup=1">
              Create your agency <ArrowUpRight size={16} />
            </Link>
            <Link className="workspace-signin" href="/login">
              Agency sign in
            </Link>
          </article>
          {process.env.HOTELS_ENABLED === "true" && (
            <article>
              <Building2 size={28} />
              <h3>Hotel owners</h3>
              <p>
                Register your property, prepare room categories and manage
                approved inventory and guest enquiries.
              </p>
              <Link className="btn secondary" href="/hotel-business">
                Hotel owners <ArrowUpRight size={16} />
              </Link>
              <Link className="workspace-signin" href="/login?next=hotelier">
                Hotel owner sign in
              </Link>
            </article>
          )}
          <article>
            <Bus size={28} />
            <h3>Bus operators</h3>
            <p>
              Register your fleet, manage charter dates, assign drivers and
              respond to full-bus booking requests.
            </p>
            <Link className="btn secondary" href="/operator">
              Bus operator workspace <ArrowUpRight size={16} />
            </Link>
            <Link
              className="workspace-signin"
              href="/login?signup=1&next=operator"
            >
              Create an operator account
            </Link>
          </article>
          <article>
            <Car size={28} />
            <h3>Car rental businesses</h3>
            <p>
              Set vehicle rates and availability, review rental requests and
              track your bookings and expenses.
            </p>
            <Link className="btn secondary" href="/operator?kind=CAR">
              Car rental workspace <ArrowUpRight size={16} />
            </Link>
            <Link className="workspace-signin" href="/login?next=operator">
              Operator sign in
            </Link>
          </article>
        </nav>
      </section>
      <section className="market-section" aria-labelledby="services-title">
        <span className="eyebrow">ONE PLATFORM FOR TRAVEL BUSINESSES</span>
        <h2 id="services-title">Your operations, connected.</h2>
        <div className="market-service-grid">
          <article id="agency-crm" className="panel">
            <h3>Travel Agency CRM</h3>
            <p>
              Capture enquiries, build packages and quotations, manage bookings
              and collections, and understand your reports.
            </p>
            <Link className="btn secondary" href="/workspace">
              Open agency workspace
            </Link>
          </article>
          <article id="hotels" className="panel">
            <h3>Hotel Management &amp; Booking</h3>
            <p>
              Register your property, manage rooms and nightly rates, and review
              reservations, guests and inventory. Approved hotels can receive
              agency booking requests.
            </p>
            <Link className="btn secondary" href="/hotelier">
              Hotel dashboard
            </Link>
          </article>
          <article id="bus-charters" className="panel">
            <h3>Bus Operator Management &amp; Booking</h3>
            <p>
              Offer complete 26, 35, 40 or 50-seater charters, or a custom
              capacity. Manage trip pricing, dates, drivers and booking
              requests.
            </p>
            <Link className="btn secondary" href="/operator">
              Bus operator dashboard
            </Link>
          </article>
          <article id="car-rental" className="panel">
            <h3>Car Rental</h3>
            <p>
              List your vehicles, set trip or kilometer rates, block unavailable
              dates and respond to full-vehicle rental requests.
            </p>
            <Link className="btn secondary" href="/operator">
              Car rental dashboard
            </Link>
          </article>
          <article id="ai-assistant" className="panel">
            <h3>AI Booking Assistant</h3>
            <p>
              Existing package and hotel guides use published facts and
              backend-verified prices. Paid AI, WhatsApp and third-party APIs
              are off by default; guided booking remains available.
            </p>
            <Link className="btn secondary" href="/marketplace">
              Explore booking partners
            </Link>
          </article>
          <article className="panel">
            <h3>Travel Agency Cross-booking</h3>
            <p>
              Find approved hotels, buses and cars. Review a fresh quote and
              track your supplier requests without sharing unrelated customer
              records.
            </p>
            <Link className="btn primary" href="/marketplace">
              Search the marketplace
            </Link>
          </article>
        </div>
      </section>
      <MarketplacePricing />
      <section className="landing-features">
        {[
          [
            "01",
            "A pipeline with purpose",
            "Keep every enquiry, follow-up and quotation moving.",
          ],
          [
            "02",
            "Collections made clear",
            "Record receipts and supplier expenses. Know what is due.",
          ],
          [
            "03",
            "Decisions with context",
            "Understand sources, package contribution and monthly performance.",
          ],
        ].map(([n, t, p]) => (
          <article key={n}>
            <span>{n}</span>
            <h3>{t}</h3>
            <p>{p}</p>
          </article>
        ))}
      </section>
      <section className="marketing-copy">
        <h2>A connected workflow for growing travel agencies.</h2>
        <p>
          Bring enquiries, quotation versions, bookings and recorded collections
          into one workspace. Compare <Link href="/features">CRM features</Link>
          , review{" "}
          <Link href="/pricing">plan capacity and pricing information</Link>, or
          follow the{" "}
          <Link href="/guides/enquiry-to-booking">
            enquiry-to-booking guide
          </Link>
          .
        </p>
      </section>
      <MarketingFooter />
    </main>
  );
}
