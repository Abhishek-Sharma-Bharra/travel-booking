import Link from "next/link";
import { proposedAgencyOffers } from "@/lib/public-offers";
import MarketingPage, { DemoCallout } from "@/components/marketing";
import { planLimits } from "@/lib/subscriptions";
import { publicMetadata } from "@/lib/seo";
export const metadata = publicMetadata(
  "/pricing",
  "Travel Agency CRM Plans & Pricing | Vashisht TravelOS",
  "Compare TravelOS team and stored enquiry limits. Request a written quote for your agency, including setup, integrations and any usage charges.",
);
export default function Pricing() {
  return (
    <MarketingPage
      path="/pricing"
      eyebrow="PLANS FOR YOUR AGENCY"
      title="Choose your business plan."
      intro="Explore proposed business subscriptions, then confirm fees, taxes and support in writing. Existing customer contracts remain unchanged."
    >
      <section
        className="marketing-grid"
        aria-label="Proposed agency subscriptions"
      >
        {proposedAgencyOffers.map((plan) => (
          <article className="marketing-card pricing-card" key={plan.name}>
            <h2>{plan.name}</h2>
            <p className="marketing-price">
              {plan.name === "Enterprise" ? "From " : ""}₹{plan.price} / month
            </p>
            <p>
              {plan.annualPrice
                ? `Annual proposal: ₹${plan.annualPrice} / year`
                : "Annual terms on request"}
            </p>
            <p>{plan.seats}</p>
            <p>Proposed offer · Checkout not active</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p>
              <strong>Upcoming / subject to setup:</strong>{" "}
              {plan.upcoming.join(" · ")}
            </p>
            <Link href="/login?signup=1" className="btn secondary">
              Start an agency trial
            </Link>
          </article>
        ))}
      </section>
      <section className="marketing-copy">
        <h2>Subscription-only offers, without booking commissions</h2>
        <p>
          These are proposed new agency offers. Hotel and transport plans are
          configured separately. Confirm entitlements, AI credits, applicable
          taxes and annual terms in writing. Checkout for these offers is not
          active. Existing contracts, marketplace agreements and historical
          ledgers remain unchanged until an explicit transition is accepted.
        </p>
        <Link href="/contact" className="btn secondary">
          Discuss hotel and transport plans
        </Link>
      </section>
      <h2>Legacy CRM capacity and custom upgrades</h2>
      <p>
        Existing Starter, Growth and Professional capacity agreements are
        managed separately; request a written quote before changing them.
      </p>
      <section className="marketing-grid" aria-label="Plan comparison">
        {Object.entries(planLimits).map(([name, limits]) => (
          <article className="marketing-card pricing-card" key={name}>
            <h2>{name}</h2>
            <p className="marketing-price">Price on request</p>
            <ul>
              <li>Up to {limits.seats} active team seats</li>
              <li>
                Up to {limits.leads.toLocaleString("en-IN")} stored enquiries
              </li>
            </ul>
            <Link href={`/contact?plan=${name}`} className="btn secondary">
              Discuss {name}
            </Link>
          </article>
        ))}
      </section>
      <section className="marketing-copy">
        <h2>What counts as a stored enquiry?</h2>
        <p>
          It is a customer enquiry record retained in your workspace. The
          allowance is a storage limit, not a monthly reset or a per-message
          allowance. Before reaching your plan’s limit, request an upgrade;
          extra capacity is not purchased automatically. Pending team
          invitations reserve seats.
        </p>
        <h2>What should the written quote cover?</h2>
        <p>
          Confirm the billing period, taxes, onboarding, support, cancellation
          terms and any AI, advertising or WhatsApp provider usage charges.
          Advertising budgets and payment provider fees are separate from CRM
          subscription fees. No unlimited provider usage is promised.
        </p>
        <h2>How does subscription payment work?</h2>
        <p>
          Owners can submit a subscription review request in the app. Billing is
          currently handled manually under the agreed terms. A request does not
          charge a card or activate paid access; payments must be independently
          verified by the service operator.
        </p>
      </section>
      <DemoCallout />
    </MarketingPage>
  );
}
