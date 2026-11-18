import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  BarChart3,
  Route,
  Users,
  FileText,
  Wallet,
  Compass,
  LayoutDashboard,
  CircleCheck,
  ChevronRight,
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
      <section className="os-hero">
        <span className="os-kicker">
          <span /> A LITTLE MORE CLARITY. A LOT MORE POSSIBILITY.
        </span>
        <h1>
          Big journeys.
          <br />
          Beautifully <span>organised.</span>
        </h1>
        <p>
          Your enquiries, itineraries, bookings and numbers.
          <br className="os-desktop-break" /> Finally together, in a workspace
          that feels effortless.
        </p>
        <div className="hero-actions">
          <Link href="/login?signup=1" className="btn primary">
            Build your workspace <ArrowUpRight size={18} />
          </Link>
          <Link href="/demo" className="btn secondary">
            Take a look inside <ArrowRight size={17} />
          </Link>
        </div>
        <div className="os-hero-note">
          <Check size={14} /> Built for travel agencies <span>·</span> No credit
          card needed to explore
        </div>
      </section>
      <section
        className="os-product-stage"
        aria-label="Illustrative TravelOS workspace preview"
      >
        <div className="os-product-window">
          <aside className="os-preview-sidebar" aria-hidden="true">
            <div className="os-preview-brand">
              <Compass size={24} /> travelos<span>WORKSPACE</span>
            </div>
            <div className="os-preview-agency">
              <span>J</span>
              <div>
                Journey Collective<small>Illustrative agency</small>
              </div>
            </div>
            <small className="os-preview-label">YOUR WORKSPACE</small>
            {[
              [LayoutDashboard, "Overview"],
              [Users, "Enquiries"],
              [Route, "Packages"],
              [FileText, "Quotations"],
              [CircleCheck, "Bookings"],
              [Wallet, "Collections"],
              [BarChart3, "BI Reports"],
            ].map(([Icon, title], i) => {
              const PreviewIcon = Icon as typeof Users;
              return (
                <div
                  className={`os-preview-nav ${i === 0 ? "selected" : ""}`}
                  key={String(title)}
                >
                  <PreviewIcon size={15} />
                  {String(title)}
                  {i === 0 && <span />}
                </div>
              );
            })}
            <div className="os-preview-bottom">
              A clearer view.
              <br />
              <strong>A better journey.</strong>
            </div>
          </aside>
          <div className="os-preview-main">
            <div className="os-preview-top">
              <span>
                Workspace <ChevronRight size={13} /> Overview
              </span>
              <span className="os-preview-status">
                <span /> Agency workspace
              </span>
            </div>
            <div className="os-preview-heading">
              <div>
                <span>EVERY DETAIL, CONNECTED</span>
                <h2>A good day starts with a clear view.</h2>
                <p>Here’s how your agency is coming together.</p>
              </div>
              <span className="os-preview-action">+ New enquiry</span>
            </div>
            <div className="os-preview-stats">
              {[
                ["Open enquiries", "24", "Your next conversations"],
                ["Quotations sent", "16", "Journeys taking shape"],
                ["Upcoming bookings", "08", "Ready for what’s next"],
              ].map(([label, value, note]) => (
                <div key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                  <span>{note}</span>
                </div>
              ))}
            </div>
            <div className="os-preview-panels">
              <div className="os-preview-pipeline">
                <div className="os-panel-title">
                  Your enquiry pipeline <small>This month</small>
                </div>
                {[
                  ["New enquiries", "12", "82%"],
                  ["In conversation", "8", "61%"],
                  ["Quotation shared", "6", "44%"],
                  ["Ready to book", "4", "29%"],
                ].map(([label, count, width], i) => (
                  <div className="os-pipeline-row" key={label}>
                    <span>
                      {label}
                      <b>{count}</b>
                    </span>
                    <div>
                      <i style={{ width, opacity: 1 - i * 0.16 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="os-preview-tasks">
                <div className="os-panel-title">
                  Up next <span className="os-tiny-dot" />
                </div>
                {[
                  ["Kerala family getaway", "Review quotation", "Today"],
                  ["Ladakh group departure", "Customer follow-up", "Today"],
                  ["Bali honeymoon", "Check payment record", "Tomorrow"],
                ].map(([title, task, date]) => (
                  <div className="os-task" key={title}>
                    <span className="os-task-check" />
                    <div>
                      <strong>{title}</strong>
                      <small>{task}</small>
                    </div>
                    <span>{date}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="os-preview-caption">
              <span className="os-tiny-dot" /> One workspace. Every step of the
              journey.<span>Illustrative demo data</span>
            </div>
          </div>
        </div>
        <div className="os-stage-caption">
          <span>LESS SWITCHING. MORE SELLING.</span>
          <p>Thoughtfully connected. From the first hello to the final mile.</p>
        </div>
      </section>
      <section className="os-workflow-strip" aria-label="Your agency workflow">
        <span>One seamless workflow</span>
        {["Enquiry", "Quotation", "Booking", "Collection", "Insight"].map(
          (step, i) => (
            <div key={step}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {step}
              {i < 4 && <ArrowRight size={15} />}
            </div>
          ),
        )}
      </section>
      <section className="os-features" id="workspace-features">
        <div className="os-section-heading">
          <span className="os-kicker">MADE FOR THE WAY YOU WORK</span>
          <h2>
            All the moving parts.
            <br />
            <span>One considered workspace.</span>
          </h2>
          <p>
            Give your team room to do what they do best.
            <br />
            Let TravelOS keep the details together.
          </p>
        </div>
        <div className="os-feature-grid">
          {[
            [
              Users,
              "Every conversation, remembered.",
              "Keep customer requirements, assigned agents and next follow-ups together. Pick up exactly where you left off.",
              "Enquiries & follow-ups",
            ],
            [
              Route,
              "From inspiration to itinerary.",
              "Manage packages, create versioned quotations and keep each booking connected to its original enquiry.",
              "Packages & bookings",
            ],
            [
              BarChart3,
              "Know where your business stands.",
              "Track recorded collections, supplier expenses and package contribution with analytics and BI reports.",
              "Collections & insights",
            ],
          ].map(([Icon, title, copy, label]) => {
            const FeatureIcon = Icon as typeof Users;
            return (
              <article key={String(title)}>
                <span className="os-feature-icon">
                  <FeatureIcon size={24} strokeWidth={1.5} />
                </span>
                <small>{String(label)}</small>
                <h3>{String(title)}</h3>
                <p>{String(copy)}</p>
                <Link href="/features">
                  Explore features <ArrowUpRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      </section>
      <section className="os-closing">
        <span className="os-kicker">YOUR NEXT CHAPTER</span>
        <h2>
          Make space for
          <br />
          <em>what’s next.</em>
        </h2>
        <p>
          A more organised agency. A little less admin.
          <br />
          And more time for the journeys that matter.
        </p>
        <div className="hero-actions">
          <Link href="/demo" className="btn primary">
            Explore Demo <ArrowUpRight size={18} />
          </Link>
          <Link href="/pricing" className="os-closing-link">
            Find your plan <ArrowRight size={17} />
          </Link>
        </div>
        <Link href="/guides/enquiry-to-booking" className="os-guide-link">
          New here? Follow the enquiry-to-booking guide.
        </Link>
      </section>
      <MarketingFooter />
    </main>
  );
}
