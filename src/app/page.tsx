import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import ProductShowcase from "@/components/product-showcase";
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

      <section className="crm-hero">
        <div className="crm-public-container">
          <p className="crm-kicker">TRAVEL AGENCY CRM</p>
          <h1>
            Keep your enquiries moving.
            <br />
            Keep your business connected.
          </h1>
          <p className="crm-hero-intro">
            Manage customer conversations, quotations, bookings and recorded
            payments in one place. Give your team a clear next step, and every
            journey the attention it deserves.
          </p>
          <div className="hero-actions">
            <Link href="/demo" className="btn primary">
              Explore Demo <ArrowRight size={17} />
            </Link>
            <Link href="/contact" className="btn secondary">
              Request a guided demo
            </Link>
          </div>
          <p className="crm-demo-note">
            <Check size={14} /> Read-only demo with fictional data. No credit
            card needed.
          </p>
        </div>
        <div className="crm-preview-frame">
          <ProductShowcase />
        </div>
      </section>
      <section
        className="crm-benefits crm-public-container"
        aria-labelledby="crm-benefits-heading"
      >
        <header>
          <p className="crm-kicker">A CLEARER WAY TO WORK</p>
          <h2 id="crm-benefits-heading">
            From the first conversation
            <br />
            to the confirmed booking.
          </h2>
          <p>The essentials your agency needs, connected in one workspace.</p>
        </header>
        <div className="crm-benefit-grid">
          {[
            [
              "01",
              "Capture every opportunity",
              "Keep customer requirements, agent ownership and follow-up dates together. Open an enquiry to find its quotations and booking.",
            ],
            [
              "02",
              "Send a considered quotation",
              "Use maintained packages, review the amounts and terms, save versions and share a customer-facing PDF.",
            ],
            [
              "03",
              "See what’s recorded and due",
              "Track manual receipts, actual expenses and customer balances separately. Read your reports with clear metric definitions.",
            ],
          ].map(([number, title, text]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <Link href="/features" className="crm-inline-link">
          Explore the features <ArrowRight size={17} />
        </Link>
      </section>
      <section className="crm-workflow">
        <div className="crm-public-container">
          <header>
            <h2>
              One workflow.
              <br />
              Fewer loose ends.
            </h2>
            <p>
              Bring your team and the details behind each trip into the same
              conversation.
            </p>
          </header>
          <ol>
            {[
              [
                "Enquiry",
                "Record what the customer needs and who will follow up.",
              ],
              [
                "Quotation",
                "Review the package, price and terms before sharing.",
              ],
              [
                "Booking",
                "Confirm the chosen quotation and keep the journey linked.",
              ],
              [
                "Collection",
                "Record actual receipts and track the outstanding balance.",
              ],
            ].map(([title, text], i) => (
              <li key={title}>
                <span>{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <Link href="/guides/enquiry-to-booking" className="crm-inline-link">
            Read the step-by-step guide <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <section className="crm-last-call crm-public-container">
        <h2>See how TravelOS fits your agency.</h2>
        <p>
          Explore the product, compare team and enquiry limits, and discuss the
          setup your business needs.
        </p>
        <div className="hero-actions">
          <Link href="/contact" className="btn primary">
            Talk to us <ArrowRight size={17} />
          </Link>
          <Link href="/pricing" className="btn secondary">
            View plans
          </Link>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
