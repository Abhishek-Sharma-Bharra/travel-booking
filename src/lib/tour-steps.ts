export const TOUR_VERSION = 1;
export const tourSteps = (role: string) => [
  {
    page: "Overview",
    title: "Your daily workspace",
    text:
      role === "AGENT"
        ? "Review your assigned enquiries and follow-ups. Your agency permissions determine the records you can access."
        : "Review agency activity and priorities. Booking value, ledger receipts and profit have different meanings.",
  },
  {
    page: "Enquiries",
    title: "Keep every enquiry moving",
    text: "Capture customer requirements, assign follow-ups and update the enquiry stage. Open an enquiry to see its timeline and quotations.",
  },
  {
    page: "Packages",
    title: "Build consistent proposals",
    text: "Reuse your package catalogue to prepare quotations. Live airline or hotel availability is not supplied by this catalogue.",
  },
  {
    page: "Quotations",
    title: "Review quotation versions",
    text: "Prepare and review a quotation, then accept it to create the booking. This tour never saves or accepts a quotation for you.",
  },
  {
    page: "Bookings",
    title: "Manage the confirmed journey",
    text: "Review travel dates, booking status and customer balance. The existing WhatsApp handoff opens your own WhatsApp application.",
  },
  {
    page: "Analytics",
    title: "Understand the numbers",
    text:
      role === "AGENT"
        ? "Review analytics for the records assigned to you. Supplier costs and agency profit are restricted."
        : "Choose dates and filters. Missing verified collections or costs appear as Data unavailable; manual receipts are not profit.",
  },
  ...(role === "AGENT"
    ? []
    : [
        {
          page: "Integrations",
          title: "Connect authorized advertising accounts",
          text: "Owners can authorize permitted Meta or Google advertising accounts. Credentials stay on the server. Configuration and provider approvals are required.",
        },
        {
          page: "Messaging",
          title: "Respect customer consent",
          text: "Official WhatsApp uses approved templates and recorded opt-in. Automated real messages remain off until separately authorized.",
        },
        {
          page: "Automation",
          title: "Control scheduled work",
          text: "Owners enable specific workflows. Review execution history, blocked jobs and failures here. A separately configured runner executes queued work.",
        },
      ]),
  ...(role === "OWNER"
    ? [
        {
          page: "Settings",
          title: "Manage agency access",
          text: "Review agency settings and team roles before inviting colleagues. Restart this walkthrough anytime with Take a Tour.",
        },
      ]
    : []),
];
