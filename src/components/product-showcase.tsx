"use client";
import { useId, useRef, useState } from "react";
import Image from "next/image";
const views = [
  {
    label: "Enquiries",
    image: "enquiries",
    copy: "Customer requirements, agent ownership and the next follow-up, together in one view.",
  },
  {
    label: "Quotations",
    image: "quotations",
    copy: "Saved quotation versions, reviewed package details and a direct path to the booking.",
  },
  {
    label: "Bookings",
    image: "bookings",
    copy: "Confirmed journeys, recorded collections and outstanding customer balances.",
  },
];
export default function ProductShowcase() {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="crm-showcase">
      <div
        role="tablist"
        aria-label="Explore TravelOS screens"
        className="crm-preview-tabs"
      >
        {views.map((view, i) => (
          <button
            key={view.label}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-controls={`${id}-panel-${i}`}
            aria-selected={active === i}
            tabIndex={active === i ? 0 : -1}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              let next = i;
              if (e.key === "ArrowRight") next = (i + 1) % views.length;
              else if (e.key === "ArrowLeft")
                next = (i + views.length - 1) % views.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = views.length - 1;
              else return;
              e.preventDefault();
              setActive(next);
              buttons.current[next]?.focus();
            }}
          >
            {view.label}
          </button>
        ))}
      </div>
      {views.map((view, i) => (
        <div
          key={view.label}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          tabIndex={0}
          hidden={active !== i}
          className="crm-preview-panel"
        >
          {active === i && (
            <>
              <div className="crm-preview-bar">
                <span>Vashisht TravelOS / {view.label}</span>
                <span>FICTIONAL DEMO</span>
              </div>
              <Image
                src={`/website/preview-${view.image}.jpg`}
                alt={`TravelOS ${view.label.toLowerCase()} screen with fictional demo records`}
                width={1440}
                height={940}
                sizes="(max-width: 800px) 94vw, 1100px"
              />
              <p>{view.copy}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
