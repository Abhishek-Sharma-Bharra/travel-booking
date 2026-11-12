import Link from "next/link";
import {
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  Wallet,
  ChartNoAxesCombined,
} from "lucide-react";
import Image from "next/image";
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

      <aside className="public-announcement" aria-label="Product introduction">
        <div className="public-container">
          <span>A clearer way to run your travel agency.</span>
          <Link href="/product-demo">
            See TravelOS in action <ArrowRight size={17} />
          </Link>
        </div>
      </aside>
      <section className="business-hero">
        <div className="public-container business-hero-grid">
          <div className="business-hero-copy">
            <p className="public-kicker">
              TRAVEL AGENCY CRM &amp; BOOKING MANAGEMENT
            </p>
            <h1>
              Better relationships.
              <br />
              Better journeys.
              <br />
              <span>One workspace.</span>
            </h1>
            <p className="business-hero-intro">
              Give every enquiry a clear next step. Bring your team, quotations,
              bookings and payment records together, so you can focus on your
              customers.
            </p>
            <div className="hero-actions">
              <Link href="/demo" className="btn primary">
                Explore Demo <ArrowRight size={18} />
              </Link>
              <Link href="/contact" className="btn secondary">
                Talk to us
              </Link>
            </div>
            <p className="business-demo-note">
              <Check size={16} /> Read-only demo. Fictional data. No credit card
              needed.
            </p>
          </div>
          <figure className="business-product-preview">
            <div className="product-window-bar">
              <span className="product-window-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>Vashisht TravelOS · Agency workspace</span>
              <span className="product-window-label">DEMO</span>
            </div>
            <Image
              src="/website/workspace-preview.jpg"
              alt="TravelOS read-only demo dashboard showing enquiry stages, bookings and recorded collections with fictional data"
              width={1440}
              height={940}
              sizes="(max-width: 900px) 94vw, 56vw"
              preload
            />
            <figcaption>
              See your agency’s day, from the first enquiry to the final
              collection.
            </figcaption>
          </figure>
        </div>
      </section>
      <section
        className="business-workflow"
        aria-label="Connected agency workflow"
      >
        <div className="public-container">
          <p>CONNECTED FROM START TO FINISH</p>
          <ol>
            <li>Capture the enquiry</li>
            <li>Prepare the quotation</li>
            <li>Confirm the booking</li>
            <li>Track the collection</li>
          </ol>
        </div>
      </section>
      <section
        className="business-capabilities public-container"
        aria-labelledby="business-capabilities-title"
      >
        <header>
          <p className="public-kicker">BUILT AROUND YOUR DAILY WORK</p>
          <h2 id="business-capabilities-title">
            Keep the details together.
            <br />
            Keep your business moving.
          </h2>
          <p>Practical tools for the people behind every trip.</p>
        </header>
        <div className="business-capability-grid">
          {[
            [
              ClipboardList,
              "Enquiries & follow-ups",
              "Give your team a shared view of customer requirements, sales stages and the next conversation.",
            ],
            [
              FileText,
              "Quotations & bookings",
              "Turn maintained packages into reviewed quotations. Keep versions, dates and booking details connected.",
            ],
            [
              Wallet,
              "Collections & expenses",
              "Record receipts and supplier expenses separately. Know what is recorded and what is still outstanding.",
            ],
            [
              ChartNoAxesCombined,
              "Reports & decisions",
              "See recorded business performance, with clear definitions and honest gaps when data is incomplete.",
            ],
          ].map(([Icon, title, text]) => {
            const FeatureIcon = Icon as typeof ClipboardList;
            return (
              <article key={String(title)}>
                <FeatureIcon size={29} strokeWidth={1.5} />
                <h3>{String(title)}</h3>
                <p>{String(text)}</p>
                <Link href="/features" aria-label={`Learn about ${title}`}>
                  Learn more <ArrowRight size={17} />
                </Link>
              </article>
            );
          })}
        </div>
      </section>
      <section className="business-process">
        <div className="public-container business-process-grid">
          <div>
            <p className="public-kicker">A WORKSPACE THAT FITS YOUR AGENCY</p>
            <h2>
              Your process.
              <br />A clearer view.
            </h2>
            <p>
              Use your packages, your team and your brand. Start with the core
              sales workflow, then configure integrations when your agency is
              ready.
            </p>
            <Link className="btn secondary" href="/guides/enquiry-to-booking">
              Read the workflow guide <ArrowRight size={17} />
            </Link>
          </div>
          <div className="business-process-list">
            <article>
              <span>01</span>
              <div>
                <h3>Bring your team together</h3>
                <p>
                  Owner, manager and agent access with a guided walkthrough of
                  the actual screens.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Keep the customer in context</h3>
                <p>
                  Open an enquiry to find its quotations, booking and recorded
                  follow-up history.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Grow at your pace</h3>
                <p>
                  Compare team and stored enquiry limits. Agree pricing and any
                  provider setup before you commit.
                </p>
                <Link href="/pricing">
                  View plans <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section className="business-final public-container">
        <p className="public-kicker">LET’S TALK ABOUT YOUR AGENCY</p>
        <h2>
          See what a more organised
          <br />
          working day could look like.
        </h2>
        <p>
          Walk through the product and discuss the workflow your team needs.
        </p>
        <div className="hero-actions">
          <Link href="/contact" className="btn primary">
            Request a guided demo <ArrowRight size={18} />
          </Link>
          <Link href="/login?signup=1" className="btn secondary">
            Create your agency
          </Link>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
