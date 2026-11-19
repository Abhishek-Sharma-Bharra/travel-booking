"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/money";
const defaults = [
  { id: "AGENCY", monthlyPaise: 99900, commissionBps: 0 },
  { id: "HOTEL", monthlyPaise: 149900, commissionBps: 300 },
  { id: "BUS", monthlyPaise: 99900, commissionBps: 200 },
  { id: "CAR", monthlyPaise: 79900, commissionBps: 300 },
];
const names: Record<string, string> = {
  AGENCY: "Travel agency",
  HOTEL: "Hotel",
  BUS: "Bus operator",
  CAR: "Car rental",
};
export default function MarketplacePricing() {
  const [plans, setPlans] = useState(defaults),
    [live, setLive] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/marketplace/plans", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.plans?.length) {
          setPlans(d.plans);
          setLive(true);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <section id="marketplace-pricing" className="market-section">
      <span className="eyebrow">PRICING & REGISTRATION</span>
      <h2>A plan for your business.</h2>
      <p>
        {live
          ? "Current proposed monthly subscription prices."
          : "Proposed starting prices; confirm the current written offer before purchase."}{" "}
        Taxes and third-party charges are separate. No automatic charge on
        registration.
      </p>
      <div className="market-price-grid">
        {plans.map((p) => (
          <article className="panel" key={p.id}>
            <h3>{names[p.id]}</h3>
            <strong className="market-price">
              {inr(p.monthlyPaise)}
              <small> / month</small>
            </strong>
            <p>
              {p.commissionBps
                ? `${p.commissionBps / 100}% on eligible marketplace bookings under an accepted contract.`
                : "Manage your agency CRM and cross-booking requests."}
            </p>
            <Link
              className="btn secondary"
              href={
                p.id === "AGENCY"
                  ? "/login?signup=1"
                  : p.id === "HOTEL"
                    ? "/login?signup=1&next=hotelier"
                    : "/login?signup=1&next=operator"
              }
            >
              Register {names[p.id].toLowerCase()}
            </Link>
          </article>
        ))}
      </div>
      <p className="method-note">
        Direct business bookings and agency referrals are not charged
        marketplace commission. Existing customer contracts remain unchanged.
        Subscription activation and settlements are recorded after external
        verification.
      </p>
    </section>
  );
}
