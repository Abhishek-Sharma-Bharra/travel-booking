import Link from "next/link";
import { ArrowUpRight, Check, Globe2, BarChart3, Route } from "lucide-react";
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
            <span className="live-dot" /> YOUR AGENCY, CONNECTED
          </span>
          <p className="hero-product-category">
            Travel agency CRM &amp; booking management software
          </p>
          <h1>
            Less admin.
            <br />
            More <em>adventure.</em>
          </h1>
          <p>
            Turn enquiries into unforgettable journeys. Bring your sales,
            bookings, collections and business insights into one thoughtfully
            simple workspace.
          </p>
          <div className="hero-actions">
            <Link href="/demo" className="btn primary">
              Explore Demo <ArrowUpRight size={18} />
            </Link>
            <Link href="/login?signup=1" className="btn secondary">
              Create your agency
            </Link>
          </div>
          <div className="hero-note">
            <Check size={16} /> No credit card needed to explore · Fictional
            demo data
          </div>
        </div>
        <div className="hero-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <Globe2 className="hero-globe" size={210} strokeWidth={0.6} />
          <div className="floating top">
            <span className="icon-box">
              <Route size={22} />
            </span>
            <div>
              <small>EVERY JOURNEY, IN ONE PLACE</small>
              <strong>Enquiry → Quotation → Booking</strong>
            </div>
          </div>
          <div className="floating bottom">
            <span className="icon-box gold">
              <BarChart3 size={22} />
            </span>
            <div>
              <small>CLARITY BEYOND THE BOOKING</small>
              <strong>Know your contribution.</strong>
            </div>
          </div>
          <span className="art-caption">A clearer view. A better journey.</span>
        </div>
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
