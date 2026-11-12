import MarketingPage, { DemoCallout } from "@/components/marketing";
import { publicMetadata } from "@/lib/seo";
export const metadata = publicMetadata(
  "/features",
  "Travel Agency CRM Features | Vashisht TravelOS",
  "Manage travel enquiries, quotation versions, bookings, manual receipts and agency analytics in one role-based travel CRM workspace.",
);
export default function Features() {
  return (
    <MarketingPage
      path="/features"
      eyebrow="TRAVEL AGENCY CRM"
      title="From first enquiry to recorded collection."
      intro="Keep sales conversations, reviewed quotations and booking operations connected, with a clear view of what your agency has recorded."
    >
      <section className="marketing-grid" aria-label="CRM features">
        {[
          [
            "Enquiries & follow-ups",
            "Keep customer requirements, assigned agents, enquiry stages and follow-up dates together. Open an enquiry to find its quotations and booking.",
          ],
          [
            "Versioned quotations",
            "Build quotations from maintained packages, review prices and terms, and save customer PDFs through your browser’s print window.",
          ],
          [
            "Bookings & balances",
            "Convert a quotation into a booking without duplicating the enquiry. Record receipts, refunds and supplier expenses, and see outstanding balances.",
          ],
          [
            "Agency analytics",
            "Filter recorded leads, conversions, bookings and collections by date and relevant dimensions. Missing costs or provider verification stay clearly unavailable.",
          ],
          [
            "Team access & onboarding",
            "Use owner, manager and agent permissions, invitations, account recovery, optional MFA and a role-specific guided tour.",
          ],
          [
            "Reviewed sales assistance",
            "Prepare follow-up templates and package-based itinerary drafts. Optional AI extraction requires a configured provider and human review before saving.",
          ],
        ].map(([title, text]) => (
          <article className="marketing-card" key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className="marketing-copy">
        <h2>Choose integrations when your agency is ready.</h2>
        <p>
          Meta Ads, Google Ads and official WhatsApp require authorized agency
          accounts, provider permissions and configuration. Automated
          notifications also need customer consent and approved templates where
          required. They are not active simply because an account is created.
        </p>
        <p>
          Manual Open in WhatsApp prepares a draft for you to review and send.
          Booking receipts record payments; the CRM does not collect money from
          a customer’s bank account. Live hotel/flight inventory and automatic
          subscription charging are not included.
        </p>
      </section>
      <DemoCallout />
    </MarketingPage>
  );
}
