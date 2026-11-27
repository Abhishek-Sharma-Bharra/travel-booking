import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  Bus,
  Car,
  Check,
  CheckCheck,
  Compass,
  FileText,
  Layers3,
  LockKeyhole,
  Mail,
  MessageSquare,
  MousePointer2,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import PublicAppearance from "@/components/public-site/public-appearance";
import HomepageNav from "@/components/public-site/homepage-nav";
import HeroCarousel from "@/components/public-site/hero-carousel";
import FeatureStory from "@/components/public-site/feature-story";
import { MarketingFooter } from "@/components/marketing";
import { publicContactEmail, publicMetadata, publicOrigin } from "@/lib/seo";
import { proposedAgencyOffers as plans } from "@/lib/public-offers";
import "./homepage.css";
export const metadata = publicMetadata(
  "/",
  "Travel Agency CRM & Booking Management | Vashisht TravelOS",
  "One connected workspace for travel agencies, hotels and transport businesses. Explore CRM, guided AI assistance, bookings and business insights with Vashisht TravelOS.",
);
const faqs = [
  [
    "Who is Vashisht TravelOS for?",
    "Travel agencies, hotel teams, bus operators and car rental businesses. Each has a dedicated workspace inside one product; your account can manage the businesses you are authorised to access.",
  ],
  [
    "Can I explore before creating an account?",
    "Yes. The read-only demo uses fictional records so you can explore the workflow without sharing customer data. Agency signup starts the existing 14-day trial; no card is collected at signup.",
  ],
  [
    "Will the AI confirm bookings on its own?",
    "No. Assistance uses published information and backend-verified quotes. Inventory, payment and supplier requirements must be met before confirmation. Consequential or external actions require approval; live AI also requires setup.",
  ],
  [
    "Are the forecasts proven predictions for my business?",
    "No. Current model previews use synthetic demo data. Real demand and occupancy forecasts need sufficient history, time-based validation and uncertainty reporting before they can inform decisions.",
  ],
  [
    "How does subscription pricing work?",
    "Business Starter ₹2,999, AI Growth ₹5,999, AI Professional ₹9,999 and Enterprise from ₹19,999 per month are proposed offers, not an active checkout. Final entitlements, applicable taxes and annual terms need confirmation. Existing contracts are not changed. Hotel and transport plans are configured separately.",
  ],
  [
    "Is the new offer subscription-only?",
    "The proposed new model uses SaaS subscriptions, without booking commissions. Existing marketplace agreements and historical ledgers remain subject to their agreed terms until an explicit transition is accepted.",
  ],
  [
    "Can buses sell individual seats?",
    "Transport supports complete vehicle charters and car rentals. Live seat-level ticketing is not enabled. Hotel listings and transport suppliers need verification before public booking requests.",
  ],
];
export default function Home() {
  const hotelsEnabled = process.env.HOTELS_ENABLED === "true",
    email = publicContactEmail();
  return (
    <PublicAppearance>
      <main id="home" className="landing saas-home">
        <HomepageNav />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${publicOrigin()}/#organization`,
                  name: "Vashisht Analytics",
                  url: publicOrigin(),
                },
                {
                  "@type": "SoftwareApplication",
                  name: "Vashisht TravelOS",
                  url: publicOrigin(),
                  applicationCategory: "BusinessApplication",
                  operatingSystem: "Web browser",
                  description:
                    "Travel agency CRM, hotel operations, vehicle charters and business insights.",
                  publisher: { "@id": `${publicOrigin()}/#organization` },
                },
              ],
            }).replace(/</g, "\\u003c"),
          }}
        />
        <div className="saas-container">
          <HeroCarousel hotelsEnabled={hotelsEnabled} />
          <div
            className="saas-capability-strip"
            aria-label="Connected business workflows"
          >
            {[
              [Users, "Enquiries & CRM"],
              [FileText, "Quotations"],
              [Building2, "Hotel operations"],
              [Bus, "Vehicle charters"],
              [BarChart3, "Business insights"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Users;
              return (
                <span key={String(label)}>
                  <I size={16} />
                  {String(label)}
                </span>
              );
            })}
          </div>
          <section id="product-overview" className="saas-section saas-overview">
            <div className="saas-overview-photo">
              <Image
                src="/images/travel-operations.webp"
                alt="Travel coordinators planning itineraries and managing daily agency operations"
                width={1200}
                height={800}
                unoptimized
                loading="eager"
              />
              <div className="saas-photo-caption">
                <Compass size={23} />
                <span>
                  For the people
                  <br />
                  <strong>behind the journey.</strong>
                </span>
              </div>
            </div>
            <div className="saas-section-copy">
              <span className="saas-kicker">
                YOUR DAY, WITHOUT THE DISCONNECT
              </span>
              <h2>
                A little less juggling.
                <br />A lot more <em>clarity.</em>
              </h2>
              <p>
                Your work doesn’t stop at a booking. There are questions to
                answer, details to arrange and relationships to look after.
              </p>
              <p>
                TravelOS brings those moving parts into a familiar place—so your
                team can spend more time creating journeys, and less time
                finding the latest update.
              </p>
              <ul className="saas-checklist">
                <li>
                  <CheckCheck size={17} /> One enquiry-to-booking workflow
                </li>
                <li>
                  <CheckCheck size={17} /> Dedicated agency, hotel and transport
                  spaces
                </li>
                <li>
                  <CheckCheck size={17} /> Clear numbers, grounded assistance,
                  human control
                </li>
              </ul>
              <a className="saas-text-link" href="/features">
                Get to know TravelOS
                <ArrowUpRight size={16} />
              </a>
            </div>
          </section>
          <section id="features" className="saas-section">
            <div className="saas-section-heading">
              <span className="saas-kicker">
                DETAILS THAT MAKE THE DIFFERENCE
              </span>
              <h2>
                From the first hello.
                <br />
                To the final <em>itinerary.</em>
              </h2>
              <p>
                A connected workflow, designed around the way travel teams work.
              </p>
            </div>
            <FeatureStory />
          </section>
          <section
            id="workspaces"
            className="saas-section workspace-selection"
            aria-labelledby="workspace-title"
          >
            <div className="saas-section-heading">
              <span className="saas-kicker">ONE PRODUCT. YOUR OWN SPACE.</span>
              <h2 id="workspace-title">Choose your workspace</h2>
              <p>
                A dedicated starting point, with the right tools for your
                business.
              </p>
            </div>
            <nav
              className="workspace-cards saas-workspace-cards"
              aria-label="Choose your business workspace"
            >
              <article>
                <span className="saas-solution-icon">
                  <BriefcaseBusiness size={23} />
                </span>
                <small>01 / SELL THE JOURNEY</small>
                <h3>Travel agencies</h3>
                <p>
                  Keep leads, packages, quotations, bookings and collections
                  moving together.
                </p>
                <a className="btn primary" href="/login?signup=1">
                  Create your agency
                  <ArrowUpRight size={15} />
                </a>
                <a className="workspace-signin" href="/login">
                  Agency sign in
                </a>
              </article>
              {hotelsEnabled && (
                <article>
                  <span className="saas-solution-icon">
                    <Building2 size={23} />
                  </span>
                  <small>02 / HOST THE EXPERIENCE</small>
                  <h3>Hotel owners</h3>
                  <p>
                    Bring room categories, nightly rates, inventory and guest
                    requests into focus.
                  </p>
                  <a className="btn secondary" href="/hotel-business">
                    Hotel owners
                    <ArrowUpRight size={15} />
                  </a>
                  <a className="workspace-signin" href="/login?next=hotelier">
                    Hotel owner sign in
                  </a>
                </article>
              )}
              <article>
                <span className="saas-solution-icon">
                  <Bus size={23} />
                </span>
                <small>03 / MOVE THE GROUP</small>
                <h3>Bus operators</h3>
                <p>
                  Manage full-bus charters, fleet availability, trip requests
                  and drivers.
                </p>
                <a className="btn secondary" href="/operator">
                  Bus operator workspace
                  <ArrowUpRight size={15} />
                </a>
                <a
                  className="workspace-signin"
                  href="/login?signup=1&next=operator"
                >
                  Register bus operator
                </a>
              </article>
              <article>
                <span className="saas-solution-icon">
                  <Car size={23} />
                </span>
                <small>04 / GO THE EXTRA MILE</small>
                <h3>Car rental businesses</h3>
                <p>
                  Set vehicle rates, block unavailable dates and manage
                  full-vehicle rental requests.
                </p>
                <a className="btn secondary" href="/operator?kind=CAR">
                  Car rental workspace
                  <ArrowUpRight size={15} />
                </a>
                <a className="workspace-signin" href="/login?next=operator">
                  Operator sign in
                </a>
              </article>
            </nav>
          </section>
          <section
            className="saas-section saas-solutions"
            aria-label="Travel business solutions"
          >
            <div className="saas-solution-banner" id="agency-crm">
              <span className="saas-solution-icon">
                <BriefcaseBusiness size={24} />
              </span>
              <div>
                <span className="saas-kicker">FOR TRAVEL AGENCIES</span>
                <h2>Travel Agency CRM</h2>
                <p>
                  Your sales workflow, from enquiry and quotation to booking,
                  supplier costs and recorded collections.
                </p>
              </div>
              <a href="/workspace" className="saas-text-link">
                Open agency workspace
                <ArrowUpRight size={16} />
              </a>
            </div>
            {hotelsEnabled && (
              <div className="saas-solution-banner" id="hotels">
                <span className="saas-solution-icon">
                  <Building2 size={24} />
                </span>
                <div>
                  <span className="saas-kicker">FOR HOSPITALITY</span>
                  <h2>Hotel Management &amp; Booking</h2>
                  <p>
                    Prepare your property, manage room availability and review
                    reservations. Public listings require independent approval.
                  </p>
                </div>
                <a href="/hotelier" className="saas-text-link">
                  Hotel dashboard
                  <ArrowUpRight size={16} />
                </a>
              </div>
            )}
            <div className="saas-solution-banner" id="bus-charters">
              <span className="saas-solution-icon">
                <Bus size={24} />
              </span>
              <div>
                <span className="saas-kicker">FOR GROUP TRAVEL</span>
                <h2>Bus Operator Management &amp; Booking</h2>
                <p>
                  26, 35, 40 and 50-seater charters, plus custom capacities.
                  Quote trips, review requests and assign drivers.
                </p>
              </div>
              <a href="/operator" className="saas-text-link">
                Bus operator dashboard
                <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="saas-solution-banner" id="car-rental">
              <span className="saas-solution-icon">
                <Car size={24} />
              </span>
              <div>
                <span className="saas-kicker">FOR INDEPENDENT JOURNEYS</span>
                <h2>Car Rental</h2>
                <p>
                  Vehicle calendars, trip or kilometre rates and rental
                  requests, with availability validated before reservation.
                </p>
              </div>
              <a href="/operator?kind=CAR" className="saas-text-link">
                Car rental dashboard
                <ArrowUpRight size={16} />
              </a>
            </div>
          </section>
          <section id="ai-agent" className="saas-section saas-ai-section">
            <div className="saas-section-copy">
              <span className="saas-kicker">
                <Sparkles size={14} /> THE VASHISHT AI TRAVEL AGENT
              </span>
              <h2>
                A helpful assistant.
                <br />
                With your judgement
                <br />
                <em>at the centre.</em>
              </h2>
              <p>
                Collect requirements, organise enquiry details and prepare the
                next conversation. Published package information and verified
                backend calculations provide the facts.
              </p>
              <div className="saas-ai-boundaries">
                <p>
                  <Check size={16} /> Hindi, English and natural travel
                  enquiries
                </p>
                <p>
                  <Check size={16} /> Drafts and guided next steps for your
                  review
                </p>
                <p>
                  <ShieldCheck size={16} /> No invented prices or booking
                  confirmations
                </p>
              </div>
              <a className="btn primary" href="/demo">
                Explore the guided demo
                <ArrowUpRight size={16} />
              </a>
              <small className="saas-availability-note">
                Guided workflows are available. Live AI requires configuration;
                external actions remain approval-based.
              </small>
            </div>
            <div className="saas-assistant-card">
              <div className="assistant-card-header">
                <span>
                  <Bot size={23} />
                </span>
                <div>
                  <h3>AI Booking Assistant</h3>
                  <small>Illustrative conversation · Fictional data</small>
                </div>
                <span className="saas-status-pill">Draft mode</span>
              </div>
              <p className="assistant-user">
                A couple is planning 5 nights in Manali. Can you help me
                organise their enquiry?
              </p>
              <div className="assistant-answer">
                <Sparkles size={18} />
                <div>
                  <strong>Let’s start with the details.</strong>
                  <p>
                    I have the destination, duration and traveller count. I
                    still need:
                  </p>
                  <ul>
                    <li>Exact travel dates and departure city</li>
                    <li>Budget and accommodation preference</li>
                    <li>Any inclusions or special requirements</li>
                  </ul>
                </div>
              </div>
              <div className="assistant-draft-note">
                <FileText size={16} /> Enquiry draft ready for human review{" "}
                <Check size={15} />
              </div>
              <div className="assistant-input-preview">
                Ask a question in your workspace…
                <ArrowUpRight size={17} />
              </div>
              <small>
                This homepage illustration does not send a message or create a
                booking.
              </small>
            </div>
          </section>
          <section id="intelligence" className="saas-section saas-intelligence">
            <div className="saas-section-heading">
              <span className="saas-kicker">VASHISHT INTELLIGENCE ENGINE</span>
              <h2>
                Decisions with context.
                <br />
                Not just <em>more dashboards.</em>
              </h2>
              <p>
                See what your data can tell you—and where it cannot yet tell the
                whole story.
              </p>
            </div>
            <div className="saas-intelligence-grid">
              {[
                [
                  Wallet,
                  "Profit intelligence",
                  "Understand selling prices, discounts, supplier costs and contribution. Calculated views keep the assumptions visible.",
                  "Calculated reports",
                ],
                [
                  BarChart3,
                  "Demand & occupancy outlook",
                  "Explore the direction of future demand. Real forecasts need sufficient history, uncertainty ranges and time-based evaluation.",
                  "Forecasting roadmap",
                ],
                [
                  MousePointer2,
                  "Marketing intelligence",
                  "Connect enquiry sources, recorded ad spend and booking outcomes. Understand attribution definitions before interpreting ROI.",
                  "Source performance",
                ],
                [
                  MessageSquare,
                  "AI business advisor",
                  "Ask better questions of your reports. A fully grounded, tool-based advisor with tenant usage limits is planned in a later phase.",
                  "Advisor roadmap",
                ],
              ].map(([Icon, title, copy, status]) => {
                const I = Icon as typeof Wallet;
                return (
                  <article key={String(title)}>
                    <span>
                      <I size={23} />
                    </span>
                    <small>{String(status)}</small>
                    <h3>{String(title)}</h3>
                    <p>{String(copy)}</p>
                  </article>
                );
              })}
            </div>
            <p className="saas-model-disclosure">
              <ShieldCheck size={16} /> Existing model previews use synthetic
              data. They are not validated predictions for your business.
            </p>
          </section>
          <section id="how-it-works" className="saas-section">
            <div className="saas-section-heading">
              <span className="saas-kicker">A CLEARER WAY TO GET GOING</span>
              <h2>
                Three steps.
                <br />
                One connected <em>working day.</em>
              </h2>
            </div>
            <div className="saas-steps">
              {[
                [
                  "01",
                  "Find your workspace",
                  "Choose agency, hotel, bus or car operations and sign in to the account you already use.",
                ],
                [
                  "02",
                  "Bring in the details",
                  "Add your team, packages or inventory. Complete business verification where required.",
                ],
                [
                  "03",
                  "Make your next move",
                  "Manage enquiries, review verified quotes and follow bookings through the right approval steps.",
                ],
              ].map(([n, t, c]) => (
                <article key={n}>
                  <span>{n}</span>
                  <h3>{t}</h3>
                  <p>{c}</p>
                </article>
              ))}
            </div>
          </section>
          <section id="pricing" className="saas-section">
            <div className="saas-section-heading">
              <span className="saas-kicker">PLANS THAT LEAVE ROOM TO GROW</span>
              <h2>A plan for your business.</h2>
              <p>
                Proposed monthly and annual subscriptions. Available
                capabilities and upcoming additions are listed separately.
              </p>
            </div>
            <div className="saas-pricing-grid">
              {plans.map((p) => (
                <article
                  key={p.name}
                  className={p.popular ? "is-featured" : ""}
                >
                  {p.popular && (
                    <span className="saas-plan-label">For growing teams</span>
                  )}
                  <h3>{p.name}</h3>
                  <p>{p.copy}</p>
                  <div className="saas-plan-price">
                    <strong>
                      {p.name === "Enterprise" ? "From " : ""}₹{p.price}
                    </strong>
                    <span>/ month</span>
                  </div>
                  <small>
                    {p.annualPrice
                      ? `Annual proposal: ₹${p.annualPrice} / year`
                      : "Annual terms on request"}
                  </small>
                  <small>{p.seats}</small>
                  <small>Proposed offer · Checkout not active</small>
                  <a
                    href="/login?signup=1"
                    className={`btn ${p.popular ? "primary" : "secondary"}`}
                  >
                    Start an agency trial
                    <ArrowUpRight size={15} />
                  </a>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f}>
                        <Check size={15} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="saas-upcoming">
                    <strong>Upcoming / subject to setup</strong>
                    <br />
                    {p.upcoming.join(" · ")}
                  </p>
                </article>
              ))}
            </div>
            <div className="saas-pricing-note">
              <LockKeyhole size={19} />
              <p>
                <strong>Existing contracts stay as agreed.</strong> These
                proposed prices do not change your current subscription or
                activate paid access. Final entitlements, AI credits, applicable
                taxes and annual terms require confirmation. New
                subscription-only offers do not include booking commissions;
                legacy agreements need an explicit transition.
              </p>
            </div>
            <div className="saas-supplier-pricing">
              <span>
                <Building2 size={20} />
                <strong>Hotel & transport plans</strong>
                <small>Configured separately for your business.</small>
              </span>
              <a href="/contact" className="saas-text-link">
                Discuss your requirements
                <ArrowUpRight size={16} />
              </a>
            </div>
          </section>
          <section id="demo" className="saas-section saas-demo">
            <div>
              <span className="saas-kicker">TAKE A LOOK AROUND</span>
              <h2>
                See the working day.
                <br />
                Before you change yours.
              </h2>
              <p>
                Explore enquiries, quotations, bookings and reports in a
                read-only workspace with clearly labeled fictional data.
              </p>
              <a className="btn primary" href="/demo">
                <Play size={15} /> Explore the product demo
                <ArrowRight size={16} />
              </a>
            </div>
            <div className="saas-demo-ticket">
              <Layers3 size={31} />
              <strong>
                Your next working day,
                <br />
                with more clarity.
              </strong>
              <span>VASHISHT TRAVELOS / DEMO ACCESS</span>
              <div>
                <Check size={14} /> Read-only workspace
                <Check size={14} /> No card needed
              </div>
            </div>
          </section>
          <section id="faqs" className="saas-section saas-faq">
            <div>
              <span className="saas-kicker">
                A FEW THINGS YOU MIGHT BE WONDERING
              </span>
              <h2>
                Good questions.
                <br />
                <em>Clear answers.</em>
              </h2>
              <p>Need to talk through your workflow?</p>
              <a href="/contact" className="saas-text-link">
                Let’s talk
                <ArrowUpRight size={16} />
              </a>
            </div>
            <div>
              {faqs.map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>
          <section id="contact" className="saas-section saas-final-cta">
            <span className="saas-kicker">LESS FRICTION. MORE FORWARD.</span>
            <h2>
              Your business has places to go.
              <br />
              Let’s make room for the journey.
            </h2>
            <div className="hero-actions">
              <a className="btn primary" href="/login?signup=1">
                Start free trial
                <ArrowRight size={16} />
              </a>
              <a className="btn secondary" href="/contact">
                Talk to Vashisht Analytics
                <ArrowUpRight size={16} />
              </a>
            </div>
            {email && (
              <a
                className="saas-contact-mail"
                href={`mailto:${email}?subject=Vashisht%20TravelOS%20enquiry`}
              >
                <Mail size={14} />
                {email}
              </a>
            )}
          </section>
          <MarketingFooter />
          <div className="saas-footer-bottom">
            <span>Vashisht Analytics · Vashisht TravelOS</span>
            <span>Thoughtfully connected travel operations.</span>
          </div>
        </div>
      </main>
    </PublicAppearance>
  );
}
