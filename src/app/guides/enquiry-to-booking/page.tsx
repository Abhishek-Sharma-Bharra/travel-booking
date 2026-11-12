import Link from "next/link";
import MarketingPage, { DemoCallout } from "@/components/marketing";
import { publicMetadata } from "@/lib/seo";
export const metadata = publicMetadata(
  "/guides/enquiry-to-booking",
  "Travel Enquiry to Booking: A CRM Workflow Guide | Vashisht TravelOS",
  "A practical travel agency workflow for qualifying enquiries, reviewing quotations, confirming bookings and recording customer payments without confusing sales with profit.",
);
export default function Guide() {
  return (
    <MarketingPage
      path="/guides/enquiry-to-booking"
      eyebrow="TRAVEL AGENCY OPERATIONS GUIDE"
      title="Turn an enquiry into a well-recorded booking."
      intro="A clear process helps your team know what to do next and keeps the customer’s requirements connected to the final booking."
    >
      <article className="marketing-copy">
        <h2>1. Capture the requirements and assign an owner.</h2>
        <p>
          Record the destination, dates, number of travellers and customer
          contact details. Clarify whether a budget is for the whole trip or per
          person. Keep unknown dates or supplier details unresolved until
          confirmed. Assign an agent and a follow-up date so the enquiry has a
          clear next action.
        </p>
        <h2>2. Qualify the trip before quoting.</h2>
        <p>
          Confirm the customer’s priorities and whether the maintained package
          suits them. Check hotel category, inclusions, exclusions and supplier
          availability. A CRM record is not a live supplier confirmation. Avoid
          promising flights, rooms or prices that your agency has not verified.
        </p>
        <h2>3. Prepare and review a versioned quotation.</h2>
        <p>
          Review traveller counts, dates, selling rates, discounts, tax and
          payment/cancellation terms. Keep an earlier quotation when
          requirements change and build a new version. Check generated itinerary
          drafts before sharing them. In TravelOS, save the customer PDF through
          Print / save PDF and attach the file to your reviewed message.
        </p>
        <h2>4. Confirm one booking for the enquiry.</h2>
        <p>
          When the customer agrees, convert the chosen quotation and set the
          customer balance due date. Check that its dates and travellers still
          match the enquiry. Open the existing booking for later updates rather
          than creating another record for the same sale.
        </p>
        <h2>5. Record receipts and actual supplier costs separately.</h2>
        <p>
          Record customer receipts only after checking payment evidence. For
          example, a ₹50,000 booking with a ₹20,000 recorded receipt has ₹30,000
          outstanding. A manual receipt records what your agency entered; it is
          not independent payment-gateway verification.
        </p>
        <p>
          Record actual hotel, transport and other direct expenses separately
          from supplier cash payments. Estimated package costs are planning
          figures. Booking value, money collected and profit are different:
          complete costs, refunds, taxes and the relevant accounting policy must
          be considered before claiming a profit.
        </p>
        <h2>Review the pipeline with the right dates.</h2>
        <p>
          Enquiry counts use enquiry dates; bookings and cash entries can fall
          in different reporting periods. Use the agency timezone and the
          dashboard’s metric definitions. Investigate missing data instead of
          treating it as zero.
        </p>
        <p>
          <Link href="/features">Explore the CRM features</Link> or{" "}
          <Link href="/pricing">compare stored enquiry and team limits</Link>{" "}
          before choosing a plan.
        </p>
      </article>
      <DemoCallout />
    </MarketingPage>
  );
}
