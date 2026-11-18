import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  Check,
  Building2,
  BriefcaseBusiness,
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
            Travel agency CRM &amp; hotel management workspaces
          </p>
          <h1>
            Less admin.
            <br />
            More <em>adventure.</em>
          </h1>
          <p>
            Vashisht TravelOS brings travel enquiries, packages, quotations,
            bookings and collections together. Hotel owners have a separate
            workspace for property registration, room inventory and guest
            enquiries.
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
        </nav>
      </section>
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
