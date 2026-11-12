import Link from "next/link";
import { Compass, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
const links = [
  ["/features", "Features"],
  ["/pricing", "Pricing"],
  ["/product-demo", "Demo"],
  ["/contact", "Contact"],
];
export function MarketingHeader({ path = "/" }: { path?: string }) {
  return (
    <nav className="landing-nav marketing-nav" aria-label="Main navigation">
      <Link href="/" className="brand" aria-label="Vashisht TravelOS home">
        <Compass size={32} />
        <span>
          vashisht<span className="brand-sub">TRAVELOS</span>
        </span>
      </Link>
      <div className="marketing-links">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </div>
      <Link className="btn secondary" href="/login">
        Sign in <ArrowUpRight size={16} />
      </Link>
    </nav>
  );
}
export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div>
        <strong>Vashisht TravelOS</strong>
        <p>by Vashisht Analytics · Built for travel agencies in India</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/guides/enquiry-to-booking">Enquiry to booking guide</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </footer>
  );
}
export default function MarketingPage({
  path,
  eyebrow,
  title,
  intro,
  children,
}: {
  path: string;
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="landing marketing-page">
      <MarketingHeader path={path} />
      <header className="marketing-intro">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>
      {children}
      <MarketingFooter />
    </main>
  );
}
export function DemoCallout() {
  return (
    <section className="marketing-callout">
      <h2>See the workflow before you decide.</h2>
      <p>
        Explore a read-only workspace with fictional data, then discuss your
        agency’s requirements.
      </p>
      <div className="hero-actions">
        <Link href="/demo" className="btn primary">
          Explore Demo <ArrowUpRight size={18} />
        </Link>
        <Link href="/contact" className="btn secondary">
          Discuss your agency
        </Link>
      </div>
    </section>
  );
}
