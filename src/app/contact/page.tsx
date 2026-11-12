import Link from "next/link";
import MarketingPage from "@/components/marketing";
import { publicMetadata, publicContactEmail } from "@/lib/seo";
export const dynamic = "force-dynamic";
export const metadata = publicMetadata(
  "/contact",
  "Contact & Book a Travel CRM Demo | Vashisht TravelOS",
  "Contact Vashisht TravelOS to discuss a travel agency CRM demo, team requirements, onboarding, pricing and integrations.",
);
export default function Contact() {
  const email = publicContactEmail();
  return (
    <MarketingPage
      path="/contact"
      eyebrow="LET’S TALK TRAVEL OPERATIONS"
      title="Tell us how your agency works."
      intro="Discuss a product demonstration, pricing or the workflows you want to improve."
    >
      <section className="marketing-grid contact-grid">
        <article className="marketing-card">
          <h2>Email for a demo or pricing</h2>
          {email ? (
            <>
              <p>
                Send your agency name, team size and the best way to reach you.
              </p>
              <a
                className="btn primary contact-email"
                href={`mailto:${email}?subject=TravelOS%20demo%20and%20pricing`}
              >
                {email}
              </a>
            </>
          ) : (
            <p>
              A public email contact is not currently available. You can explore
              the demo below.
            </p>
          )}
          <p>
            Share your business requirements, not passwords, API keys, card
            information or customer identity documents.
          </p>
        </article>
        <article className="marketing-card">
          <h2>Try the workflow yourself</h2>
          <p>
            The public demo uses fictional data and is read-only. It is a
            product walkthrough, not your agency’s live workspace.
          </p>
          <Link href="/demo" className="btn secondary">
            Explore Demo
          </Link>
          <p>
            Already using TravelOS? Include a short description of the issue and
            a redacted screenshot when contacting support.
          </p>
        </article>
      </section>
    </MarketingPage>
  );
}
