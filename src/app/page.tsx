import Link from "next/link";
import {
  Compass,
  ArrowUpRight,
  Check,
  Globe2,
  BarChart3,
  Route,
} from "lucide-react";
export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link href="/" className="brand">
          <Compass size={32} />
          <span>
            vashisht<span className="brand-sub">TRAVELOS</span>
          </span>
        </Link>
        <span className="muted hide-mobile">
          Built for journeys. Designed for growth.
        </span>
        <Link className="btn secondary" href="/login">
          Sign in <ArrowUpRight size={16} />
        </Link>
      </nav>
      <section className="hero">
        <div>
          <span className="eyebrow">
            <span className="live-dot" /> YOUR AGENCY, CONNECTED
          </span>
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
            <Check size={16} /> No credit card · Fictional demo data · No paid
            APIs
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
      <footer>
        Vashisht TravelOS{" "}
        <span>by Vashisht Analytics · Built for travel agencies in India</span>
      </footer>
    </main>
  );
}
