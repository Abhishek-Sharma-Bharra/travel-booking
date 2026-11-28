"use client";
import { useEffect, useRef, useState, createContext, useContext } from "react";
import { X, ArrowUpRight } from "lucide-react";
import { proposedAgencyOffers } from "@/lib/public-offers";
export type PublicPanel =
  | "product"
  | "features"
  | "solutions"
  | "intelligence"
  | "pricing"
  | "demo"
  | "contact";
const PanelContext = createContext<(panel: PublicPanel) => void>(() => {});
const titles: Record<PublicPanel, string> = {
  product: "One operating system for your travel business",
  features: "From quotation to a well-managed booking",
  solutions: "Choose your business workspace",
  intelligence: "AI assistance, grounded in your records",
  pricing: "Plans that grow with your business",
  demo: "Explore the product before you decide",
  contact: "Talk to VASHISHT TravelOS",
};
const groups: Record<
  Exclude<PublicPanel, "pricing" | "contact">,
  { title: string; copy: string; href: string; action: string }[]
> = {
  product: [
    {
      title: "Travel CRM & lead management",
      copy: "Leads, pipeline, follow-ups and customer history.",
      href: "/features",
      action: "View product features",
    },
    {
      title: "Itineraries & operations",
      copy: "Itinerary costing, suppliers and trip operations.",
      href: "/product-demo",
      action: "Open the product tour",
    },
    {
      title: "Booking management",
      copy: "Hotel rooms, full bus charters and car rentals.",
      href: "/marketplace",
      action: "Explore the marketplace",
    },
    {
      title: "Accounts & GST documents",
      copy: "Reviewed GST invoices, credit notes and payment records.",
      href: "/workspace/commerce",
      action: "Open accounts workspace",
    },
    {
      title: "Customer portal",
      copy: "Private booking details, documents and payment status.",
      href: "/customer",
      action: "Open customer portal",
    },
    {
      title: "Hotel & flight connections",
      copy: "Supplier-maintained hotel inventory. External flight ticketing is not enabled.",
      href: "/marketplace",
      action: "Explore current inventory",
    },
    {
      title: "Quotation software",
      copy: "Versioned quotes, reviewed acceptance and booking documents.",
      href: "/guides/enquiry-to-booking",
      action: "View quotation workflow",
    },
    {
      title: "Official WhatsApp",
      copy: "Approved text templates and opt-in delivery; business setup required.",
      href: "/workspace/communications",
      action: "Open messaging workspace",
    },
  ],
  features: [
    {
      title: "Quotations → bookings → documents",
      copy: "Maintain packages and terms, save quotation versions, create a booking through the quotation workflow, then print branded booking documents. PDF downloads use the browser print flow.",
      href: "/guides/enquiry-to-booking",
      action: "See the booking workflow",
    },
    {
      title: "Follow-ups and WhatsApp drafts",
      copy: "Track assigned enquiries and follow-up dates. Prepare a WhatsApp draft for human review. Official Meta template/media delivery needs an approved connection and opt-in. Native D1 approved text-template delivery has a dedicated workspace; media/bulk sends remain disabled.",
      href: "/features",
      action: "See integration availability",
    },
    {
      title: "Private supplier contracts",
      copy: "Owners and managers can maintain supplier contacts, negotiated INR rates, contract terms and immutable history without changing previous ledger records.",
      href: "/login",
      action: "Open your agency workspace",
    },
  ],
  solutions: [
    {
      title: "Travel agencies",
      copy: "CRM, itinerary costing, quotations, bookings, collections, supplier records and guided sales assistance.",
      href: "/login?signup=1",
      action: "Start an agency trial",
    },
    {
      title: "Hotels",
      copy: "Register a private hotel draft, add room categories and availability, then complete verification and approval before publication. Manage reservations and guest operations.",
      href: "/hotel-business",
      action: "Explore the hotel workspace",
    },
    {
      title: "Bus operators",
      copy: "Full bus charters, vehicle calendars, trip/km pricing, driver assignment and recorded operating expenses. Live seat-level ticketing is not enabled.",
      href: "/operator?kind=BUS",
      action: "Open bus operations",
    },
    {
      title: "Car rentals",
      copy: "Maintain vehicles, review requests and manage full-vehicle rental operations with your own authorised business scope.",
      href: "/operator?kind=CAR",
      action: "Open car rental operations",
    },
  ],
  intelligence: [
    {
      title: "Guided assistant available",
      copy: "Ask about accessible enquiries, maintained packages and recorded business figures. Review drafts before saving consequential changes; prices and payment truth come from backend records.",
      href: "/demo",
      action: "Explore guided assistance",
    },
    {
      title: "Live AI requires configuration",
      copy: "A real model provider needs a secure backend API key, approved pilot and measured agency budget. A ChatGPT subscription does not provide API credits. Paid routing remains disabled until configured and tested.",
      href: "/contact",
      action: "Discuss an AI pilot",
    },
    {
      title: "Voice input and messaging",
      copy: "Browser voice dictation is available with microphone consent and review before submit. Official text-template delivery requires an approved business connection. Inbound AI phone calls are not enabled.",
      href: "/features",
      action: "View current capabilities",
    },
  ],
  demo: [
    {
      title: "Explore a working demo",
      copy: "Try the agency workspace with clearly labelled fictional records. Demo data does not create a real booking or move money.",
      href: "/demo",
      action: "Launch interactive demo",
    },
    {
      title: "See the workflow",
      copy: "Follow enquiry → quotation → booking → operations, including current permission and payment-verification boundaries.",
      href: "/product-demo",
      action: "Take a product tour",
    },
  ],
};
export function PublicMenuButton({
  panel,
  children,
  className = "",
  onOpen,
}: {
  panel: PublicPanel;
  children: React.ReactNode;
  className?: string;
  onOpen?: () => void;
}) {
  const openPanel = useContext(PanelContext);
  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={() => {
        openPanel(panel);
        onOpen?.();
      }}
    >
      {children}
    </button>
  );
}
export default function PublicPanels({
  phone,
  children,
}: {
  phone: string;
  children: React.ReactNode;
}) {
  const [panel, setPanel] = useState<PublicPanel | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal();
    if (!panel && dialog.current?.open) dialog.current.close();
  }, [panel]);
  function close() {
    setPanel(null);
    const target = previous.current;
    if (target?.getClientRects().length) target.focus();
    else
      document.querySelector<HTMLButtonElement>(".saas-menu-toggle")?.focus();
  }
  useEffect(() => {
    if (!panel) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [panel]);
  return (
    <PanelContext.Provider
      value={(key) => {
        previous.current = document.activeElement as HTMLElement;
        setPanel(key);
      }}
    >
      {children}
      <dialog
        ref={dialog}
        className="public-panel"
        aria-labelledby="public-panel-title"
        onCancel={() => setPanel(null)}
        onClose={close}
        onClick={(e) => {
          if (e.target === dialog.current) {
            const r = dialog.current.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              close();
          }
        }}
      >
        {panel && (
          <>
            <header className="public-panel-heading">
              <div>
                <span className="eyebrow">VASHISHT TRAVELOS</span>
                <h2 id="public-panel-title">{titles[panel]}</h2>
              </div>
              <button
                className="public-panel-close"
                aria-label="Close information panel"
                onClick={close}
              >
                <X size={24} />
              </button>
            </header>
            {panel === "pricing" ? (
              <>
                <p>
                  Monthly proposals, plus applicable GST. Existing customer
                  agreements stay unchanged. Checkout is not active; confirm
                  terms and usage allowances in writing.
                </p>
                <div className="public-panel-grid">
                  {proposedAgencyOffers.map((p) => (
                    <article key={p.name}>
                      <h3>{p.name}</h3>
                      <strong className="public-panel-price">
                        ₹{p.price}
                        <small> / month + GST</small>
                      </strong>
                      <p>{p.seats}</p>
                      <ul>
                        {p.features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                      <p>
                        <strong>Upcoming / subject to setup:</strong>{" "}
                        {p.upcoming.join(" · ")}
                      </p>
                    </article>
                  ))}
                </div>
                <a className="btn primary" href="/pricing">
                  Open detailed pricing <ArrowUpRight size={16} />
                </a>
              </>
            ) : panel === "contact" ? (
              <div className="public-panel-contact">
                <p>
                  Talk about your agency, hotel or transport business,
                  onboarding and a product demonstration.
                </p>
                <a
                  className="btn primary"
                  href={`https://wa.me/${phone}?text=${encodeURIComponent("Namaste VASHISHT team, I would like to discuss TravelOS for my business.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Contact on WhatsApp <ArrowUpRight size={16} />
                </a>
                <a className="btn secondary" href="/contact">
                  Open contact details
                </a>
                <p>
                  Click-to-chat opens WhatsApp for you to review and send. It
                  does not send an automatic message or activate the official
                  messaging API.
                </p>
              </div>
            ) : (
              <div className="public-panel-grid">
                {groups[panel].map((item) => (
                  <article key={item.title}>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                    <a className="btn secondary" href={item.href}>
                      {item.action} <ArrowUpRight size={16} />
                    </a>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </dialog>
    </PanelContext.Provider>
  );
}
