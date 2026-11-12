import Link from "next/link";
export default function Policy({ kind }: { kind: "privacy" | "terms" }) {
  const email = process.env.SUPPORT_EMAIL,
    contact = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return (
    <main className="auth-page">
      <section className="panel prose" style={{ maxWidth: 800, width: "100%" }}>
        <Link href="/" className="eyebrow">
          VASHISHT TRAVELOS · VASHISHT ANALYTICS
        </Link>
        <h1>
          {kind === "privacy" ? "Privacy information" : "Pilot service terms"}
        </h1>
        <p>
          Updated 26 October 2026. These operational summaries must be reviewed
          with the provider’s legal identity, applicable law and your signed
          service agreement before commercial onboarding.
        </p>
        {kind === "privacy" ? (
          <>
            <h2>What the service stores</h2>
            <p>
              Agency profiles, team account details, customer contact
              information you enter, enquiries, quotations, bookings, manually
              recorded transactions and audit events. Passwords are hashed by
              the authentication library. Do not upload passport numbers,
              identity documents, payment-card details or other unnecessary
              sensitive information.
            </p>
            <h2>Purpose and access</h2>
            <p>
              Records support your agency’s sales, travel operations and
              reporting. Agency owners control team access; sales agents see
              assigned work. The provider’s authorised administrators may access
              infrastructure for support, recovery and incident response.
              Agencies are responsible for obtaining appropriate permissions to
              enter customer data.
            </p>
            <h2>Hosting and email</h2>
            <p>
              The deployment described in this project uses Render application
              hosting and PostgreSQL. Depending on the configured mail
              transport, Gmail/your SMTP provider or Resend delivers
              verification, recovery and invitation emails. Confirm your actual
              deployment region and subprocessors in your onboarding agreement.
              No external AI API is required; the prediction demo uses
              synthetic-model coefficients.
            </p>
            <h2>Retention, exports and requests</h2>
            <p>
              Owners can export permitted records in Settings. Agree a specific
              retention, backup retention and cancellation/deletion period in
              writing before a pilot. Export, correction and deletion requests
              are handled through support; no automatic erasure schedule is
              promised by this version. Backup copies may follow a separate
              documented retention policy.
            </p>
          </>
        ) : (
          <>
            <h2>Service scope</h2>
            <p>
              TravelOS is an operational workspace for travel agencies. It
              records transactions manually and does not transfer funds, issue
              statutory tax filings or process subscription payments.
              Contribution is not net profit. The synthetic prediction model is
              not validated on your agency.
            </p>
            <h2>Plans, fees and support</h2>
            <p>
              Prices, taxes, payment dates, onboarding scope, support hours,
              user limits, renewal and cancellation terms must be specified in a
              signed order. Trial workspaces last 14 days. Inactive
              subscriptions retain readable/exportable records while business
              writes are restricted. Subscription status is administered
              manually; no card is charged by this app.
            </p>
            <h2>Responsibilities and limits</h2>
            <p>
              Use individual accounts, protect your credentials and verify
              financial entries against your source records. Do not share
              account recovery links or enter identity documents. Availability,
              backups, incident response and recovery commitments must be agreed
              for the actual hosting plan; free hosting can sleep or expire. No
              guaranteed revenue lift, conversion improvement or forecast
              accuracy is promised.
            </p>
            <h2>Cancellation and data handover</h2>
            <p>
              Agree export, handover, retention and deletion procedures before
              subscribing. No automatic refund or financial penalty policy is
              created by this page.
            </p>
          </>
        )}
        <h2>Contact</h2>
        {contact ? (
          <p>
            <a className="text-button" href={`mailto:${email}`}>
              {email}
            </a>
          </p>
        ) : (
          <p>
            Ask your onboarding representative for the provider’s support and
            privacy contact before providing real customer data.
          </p>
        )}
        <div className="row-actions">
          <Link className="text-button" href="/privacy">
            Privacy information
          </Link>
          <Link className="text-button" href="/terms">
            Pilot terms
          </Link>
          <Link className="text-button" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
