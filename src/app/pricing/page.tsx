import Link from "next/link";
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
      title="Choose the capacity. Agree the costs."
      intro="Subscription prices are available on request. Confirm your requirements, fees and support terms in writing before purchasing."
    >
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
