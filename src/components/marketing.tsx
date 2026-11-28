import {
  PublicMenuButton,
  type PublicPanel,
} from "./public-site/public-panels";
import Link from "next/link";
import { Compass, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
const links = [
  ["/product-demo", "Product"],
  ["/features", "Features"],
  ["/#workspaces", "Solutions"],
  ["/pricing", "Pricing"],
  ["/marketplace", "Marketplace"],
  ["/product-demo", "Demo"],
  ["/contact", "Contact"],
];
export function MarketingHeader({
  path = "/",
  audience = "agency",
}: {
  path?: string;
  audience?: "agency" | "hotel";
}) {
  const hotelsEnabled = process.env.HOTELS_ENABLED === "true";
  const hotelAudience = audience === "hotel";
  const navigation = hotelAudience
    ? [
        ["/hotel-business#hotel-features", "Hotel features"],
        ["/hotel-business#how-it-works", "How it works"],
      ]
    : links;
  return (
    <>
      <nav className="landing-nav marketing-nav" aria-label="Main navigation">
        <Link
          href={hotelAudience ? "/hotel-business" : "/"}
          className="brand"
          aria-label={
            hotelAudience
              ? "Vashisht hotel business home"
              : "Vashisht TravelOS home"
          }
        >
          <Compass size={32} />
          <span>
            VASHISHT<span className="brand-sub">TRAVELOS</span>
          </span>
        </Link>
        <div className="marketing-links">
          {hotelsEnabled && <Link href="/#workspaces">Workspaces</Link>}
          {navigation.map(([href, label]) => (
            <PublicMenuButton
              key={href}
              panel={
                (
                  {
                    Product: "product",
                    Features: "features",
                    Solutions: "solutions",
                    Marketplace: "solutions",
                    Demo: "demo",
                    Contact: "contact",
                    Pricing: "pricing",
                    "Hotel features": "solutions",
                    "How it works": "product",
                  } as Record<string, PublicPanel>
                )[label] || "product"
              }
            >
              {label}
            </PublicMenuButton>
          ))}
          {hotelAudience && process.env.HOTEL_BOOKING_ENABLED === "true" && (
            <Link href="/stays">Find a hotel · for guests</Link>
          )}
        </div>
        <Link
          className="btn secondary"
          href={hotelAudience ? "/login?next=hotelier" : "/login"}
        >
          {hotelAudience ? "Hotel owner sign in" : "Agency sign in"}{" "}
          <ArrowUpRight size={16} />
        </Link>
      </nav>
    </>
  );
}
export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div>
        <strong>Vashisht TravelOS</strong>
        <p>by Vashisht Analytics · Workspaces for travel and hospitality</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/">Travel agency CRM</Link>
        {process.env.HOTELS_ENABLED === "true" && (
          <Link href="/hotel-business">Hotel owner workspace</Link>
        )}
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
    <>
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
    </>
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
