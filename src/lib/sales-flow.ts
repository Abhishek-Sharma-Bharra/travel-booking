type EnquirySnapshot = {
  stage: string;
  travellers: number;
  travelStart: string | Date;
  travelEnd: string | Date;
};
type QuoteSnapshot = {
  status: string;
  travellers: number;
  travelStart: string | Date;
  travelEnd: string | Date;
};
export function bookingBlockReason(
  quote: QuoteSnapshot,
  enquiry: EnquirySnapshot | undefined,
  hasBooking: boolean,
): string | null {
  if (hasBooking)
    return "This enquiry already has a booking. Open the existing booking instead.";
  if (!enquiry) return "This enquiry is unavailable. Refresh the workspace.";
  if (quote.status !== "Draft") return "This quotation is no longer a draft.";
  if (enquiry.stage === "Lost")
    return "Reopen the lost enquiry before accepting a quotation.";
  if (enquiry.stage === "Won")
    return "This enquiry is already marked Won. Review its existing booking.";
  if (
    quote.travellers !== enquiry.travellers ||
    +new Date(quote.travelStart) !== +new Date(enquiry.travelStart) ||
    +new Date(quote.travelEnd) !== +new Date(enquiry.travelEnd)
  )
    return "Travellers or travel dates changed. Build a new quotation before booking.";
  return null;
}
