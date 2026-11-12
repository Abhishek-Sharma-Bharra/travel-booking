import Link from "next/link";
import MarketingPage from "@/components/marketing";
import { publicMetadata } from "@/lib/seo";
export const metadata = publicMetadata(
  "/product-demo",
  "Travel Agency CRM Demo | Vashisht TravelOS",
  "Explore the TravelOS read-only demo: enquiry pipeline, quotations, bookings, payment records and travel agency analytics with fictional data.",
);
export default function ProductDemo() {
  return (
    <MarketingPage
      path="/product-demo"
      eyebrow="A WALK THROUGH TRAVELOS"
      title="See your agency’s daily workflow."
      intro="Explore a read-only demonstration with fictional enquiries, bookings and financial records. No customer data or payment is needed to view it."
    >
      <section className="marketing-copy">
        <h2>What to explore</h2>
        <ol className="marketing-steps">
          <li>
            <strong>Start with an enquiry.</strong> Follow the customer’s
            requirements, assigned agent and sales stage.
          </li>
          <li>
            <strong>Review the quotation.</strong> See package details, travel
            dates, quotation versions and customer-facing pricing.
          </li>
          <li>
            <strong>Open the booking.</strong> Compare the recorded booking
            value with receipts and customer outstanding.
          </li>
          <li>
            <strong>Read the analytics.</strong> Change dates and filters.
            Inspect the metric definitions and unavailable data.
          </li>
          <li>
            <strong>Use Take a Tour.</strong> Follow the guided walkthrough of
            the actual screens.
          </li>
        </ol>
        <p>
          Writes and live provider operations are disabled in the public demo.
          To test saving an enquiry and booking, use your own workspace with
          test records. Paid providers and approved messaging require separate
          setup.
        </p>
        <div className="hero-actions">
          <Link className="btn primary" href="/demo">
            Explore Demo
          </Link>
          <Link className="btn secondary" href="/contact">
            Request a guided demo
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
