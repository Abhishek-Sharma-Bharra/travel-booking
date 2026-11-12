import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import ProductShowcase from "@/components/product-showcase";
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

      <section className="premium-hero premium-container">
        <div className="premium-hero-copy">
          <p className="premium-kicker">THE WORKSPACE FOR TRAVEL AGENCIES</p>
          <h1>
            Your agency.
            <br />
            Every journey.
            <br />
            <em>In control.</em>
          </h1>
          <p className="premium-intro">
            Behind every great trip is a well-run agency. Bring enquiries,
            quotations, bookings and collections into one beautifully organised
            workspace.
          </p>
          <div className="hero-actions">
            <Link href="/demo" className="btn primary">
              Explore Demo <ArrowRight size={18} />
            </Link>
            <Link href="/contact" className="premium-text-link">
              Let’s talk about your agency <ArrowRight size={17} />
            </Link>
          </div>
          <p className="premium-demo-note">
            <Check size={14} /> Read-only demo · Fictional data · No credit card
            needed
          </p>
        </div>
        <figure className="premium-travel-image">
          <Image
            src="/website/premium-landscape.png"
            alt="Illustrative alpine lake and mountain landscape in warm evening light"
            fill
            sizes="(max-width: 800px) 100vw, 48vw"
            preload
          />
          <figcaption>
            <span>THE JOURNEY IS THEIR STORY.</span>
            <strong>
              Make the work behind it
              <br />a little more effortless.
            </strong>
          </figcaption>
        </figure>
      </section>
      <section className="premium-promise">
        <div className="premium-container">
          <p>LESS CHASING. MORE CLARITY.</p>
          <div>
            <span>One connected workflow</span>
            <i aria-hidden="true" />
            <span>Your team, together</span>
            <i aria-hidden="true" />
            <span>A clear view of what’s due</span>
          </div>
        </div>
      </section>
      <section
        className="premium-capabilities premium-container"
        aria-labelledby="premium-capabilities-heading"
      >
        <header className="premium-section-heading">
          <p className="premium-kicker">BUILT FOR THE BUSINESS OF TRAVEL</p>
          <h2 id="premium-capabilities-heading">
            A little less admin.
            <br />
            <em>A lot more possibility.</em>
          </h2>
          <p>
            Practical tools for your team. A smoother experience for your
            customers.
          </p>
        </header>
        <div className="premium-capability-grid">
          {[
            [
              "01",
              "Keep every conversation moving.",
              "Know who enquired, what they need and when to follow up. Give every opportunity a clear next step.",
              "Enquiries & follow-ups",
            ],
            [
              "02",
              "Put a considered proposal forward.",
              "Build quotations from your maintained packages. Review the details, keep versions and share a customer PDF.",
              "Quotations & bookings",
            ],
            [
              "03",
              "Know where your business stands.",
              "Record collections and expenses separately. See outstanding balances and reports based on the data you have.",
              "Collections & insights",
            ],
          ].map(([n, title, text, label]) => (
            <article key={n}>
              <span className="premium-number">{n}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <Link href="/features">
                {label} <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="premium-product">
        <div className="premium-container">
          <div className="premium-product-heading">
            <div>
              <p className="premium-kicker">A CLOSER LOOK AT TRAVELOS</p>
              <h2>
                Everything connected.
                <br />
                <em>Nothing lost along the way.</em>
              </h2>
            </div>
            <p>
              From the first enquiry to the final collection, keep the customer
              and their journey in context.
            </p>
          </div>
          <ProductShowcase />
        </div>
      </section>
      <section className="premium-how premium-container">
        <header>
          <p className="premium-kicker">GETTING STARTED</p>
          <h2>
            Your way of working.
            <br />
            <em>With a clearer view.</em>
          </h2>
          <p>
            Start with the workflow you need today. Configure additional
            integrations when your agency is ready.
          </p>
          <Link href="/guides/enquiry-to-booking" className="premium-text-link">
            Read the workflow guide <ArrowRight size={17} />
          </Link>
        </header>
        <ol>
          {[
            [
              "Make it yours.",
              "Add your agency details, maintained packages and team. Keep access appropriate to each role.",
            ],
            [
              "Bring the work together.",
              "Capture an enquiry, prepare a reviewed quotation and confirm the booking without losing the history.",
            ],
            [
              "Keep moving with confidence.",
              "Record actual receipts and expenses. Review follow-ups, balances and the metrics your data supports.",
            ],
          ].map(([title, text], i) => (
            <li key={title}>
              <span>0{i + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="premium-final">
        <div className="premium-container">
          <p className="premium-kicker">YOUR NEXT CHAPTER</p>
          <h2>
            Good journeys deserve
            <br />
            <em>a better way of working.</em>
          </h2>
          <p>
            See TravelOS for yourself. Let’s talk about what your agency needs.
          </p>
          <div className="hero-actions">
            <Link href="/contact" className="btn primary">
              Request a guided demo <ArrowRight size={18} />
            </Link>
            <Link href="/pricing" className="premium-text-link">
              Explore plans <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
