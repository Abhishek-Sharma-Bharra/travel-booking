// Versioned display proposals only: never derive charges or entitlements here.
// Existing subscription identifiers, capacities and customer agreements stay intact.
export const publicOfferVersion = "advanced-erp-proposal-2026-11-27-v2";
export const proposedAgencyOffers = [
  {
    name: "Business Starter",
    price: "2,499",
    annualPrice: null,
    seats: "3 staff accounts proposed",
    copy: "A connected foundation for travel operations.",
    popular: false,
    features: [
      "CRM, enquiries & follow-ups",
      "Packages, itinerary drafts & costing",
      "Quotation and booking records",
      "Supplier balances & business dashboard",
    ],
    upcoming: ["GST-compliant billing & full customer portal"],
  },
  {
    name: "AI Growth",
    price: "4,999",
    annualPrice: null,
    seats: "10 staff accounts proposed",
    copy: "For teams building a connected sales workflow.",
    popular: true,
    features: [
      "Starter workflow capabilities",
      "Scoped team roles & access",
      "Campaign links & attribution reports",
      "Guided sales assistant & analytics",
    ],
    upcoming: [
      "Live AI sales & approved messaging automation",
      "Branded customer portal & validated lead scoring",
    ],
  },
  {
    name: "AI Professional",
    price: "8,999",
    annualPrice: null,
    seats: "25 staff accounts proposed",
    copy: "Bring operations and business reporting together.",
    popular: false,
    features: [
      "Growth workflow capabilities",
      "Hotel & transport workspaces",
      "Grounded business advisor tools",
      "Planning baselines with data sufficiency labels",
    ],
    upcoming: [
      "Voice agent & validated ML forecasting",
      "Advanced B2B workflows & agreed priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "14,999",
    annualPrice: null,
    seats: "Custom limits by agreement",
    copy: "A scoped implementation for complex operations.",
    popular: false,
    features: [
      "Discuss existing modules with your team",
      "Define usage limits and onboarding scope",
      "Written integration & support requirements",
    ],
    upcoming: [
      "Multi-branch & advanced white label",
      "Custom integrations, AI workflows & enterprise analytics",
    ],
  },
] as const;
