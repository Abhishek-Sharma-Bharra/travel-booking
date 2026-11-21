import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Compass,
  LayoutDashboard,
  MessageSquare,
  Search,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
export type PreviewKind =
  "agency" | "assistant" | "hotel" | "transport" | "intelligence" | "quotation";
const data = {
  agency: {
    title: "Your business, at a glance",
    subtitle: "Good morning, travel team",
    stats: ["24", "₹4.82L", "08"],
    labels: ["Active enquiries", "Booking value", "Follow-ups today"],
  },
  assistant: {
    title: "A conversation with direction",
    subtitle: "Travel enquiry assistant",
    stats: ["02", "05", "Draft"],
    labels: ["Travellers", "Nights", "Enquiry status"],
  },
  hotel: {
    title: "Every stay starts here",
    subtitle: "Hotel operations",
    stats: ["12", "08", "04"],
    labels: ["Rooms listed", "Rooms occupied", "Available rooms"],
  },
  transport: {
    title: "Ready for the road ahead",
    subtitle: "Fleet operations",
    stats: ["06", "04", "02"],
    labels: ["Vehicles", "Upcoming trips", "Available today"],
  },
  intelligence: {
    title: "Clarity for your next move",
    subtitle: "Vashisht Intelligence",
    stats: ["30d", "18–26", "Demo"],
    labels: ["Outlook", "Illustrative range", "Model status"],
  },
  quotation: {
    title: "A considered quote. A clear margin.",
    subtitle: "Quotation studio",
    stats: ["₹48k", "₹39k", "₹9k"],
    labels: ["Selling price", "Estimated cost", "Contribution"],
  },
};
export default function ProductPreview({
  kind = "agency",
  compact = false,
  instance = "preview",
}: {
  kind?: PreviewKind;
  compact?: boolean;
  instance?: string;
}) {
  const d = data[kind];
  return (
    <div
      className={`product-preview ${compact ? "is-compact" : ""}`}
      role="img"
      aria-label={`${d.subtitle} fictional product preview`}
    >
      <div className="preview-window">
        <span />
        <span />
        <span />
        <p>Product preview · Fictional data</p>
        <span className="preview-secure">
          <Check size={12} /> Demo
        </span>
      </div>
      <div className="preview-app">
        <aside className="preview-sidebar" aria-hidden="true">
          <div className="preview-mark">
            <Compass size={19} />
            <strong>TravelOS</strong>
          </div>
          <small>YOUR WORKSPACE</small>
          {[
            [LayoutDashboard, "Overview"],
            [Users, "Enquiries"],
            [CalendarDays, "Bookings"],
            [Wallet, "Collections"],
            [Sparkles, "Intelligence"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Users;
            return (
              <span
                key={String(label)}
                className={
                  label ===
                  (kind === "intelligence" ? "Intelligence" : "Overview")
                    ? "selected"
                    : ""
                }
              >
                <I size={13} />
                {String(label)}
              </span>
            );
          })}
          <div className="preview-profile">
            <b>VT</b>
            <span>
              Travel team<small>Demo workspace</small>
            </span>
          </div>
        </aside>
        <div className="preview-content">
          <div className="preview-topline">
            <span>{d.subtitle}</span>
            <div aria-hidden="true">
              <Search size={13} />
              <Bell size={13} />
              <b>VT</b>
            </div>
          </div>
          <div className="preview-heading">
            <div>
              <small>LET’S MAKE TODAY COUNT</small>
              <h3>{d.title}</h3>
            </div>
            <span className="preview-date">
              This month <ChevronDown size={11} />
            </span>
          </div>
          <div className="preview-metrics">
            {d.stats.map((v, i) => (
              <div key={d.labels[i]}>
                <span>{d.labels[i]}</span>
                <strong>{v}</strong>
                <small>
                  {i === 0
                    ? "Your working view"
                    : i === 1
                      ? "Illustrative figures"
                      : "Keep things moving"}
                </small>
              </div>
            ))}
          </div>
          {kind === "assistant" ? (
            <div className="preview-chat">
              <div className="preview-chat-name">
                <Sparkles size={16} />
                <strong>Vashisht assistant</strong>
                <span>Guided preview</span>
              </div>
              <p className="chat-customer">
                Manali ke liye 2 adults, 5 nights ka trip chahiye.
              </p>
              <p className="chat-agent">
                Bilkul. What are your travel dates and budget? I’ll help you
                explore the published package details.
              </p>
              <div className="chat-draft">
                <Check size={13} /> Requirements captured · awaiting your review
              </div>
              <small>
                Prices and availability need backend verification. No booking
                confirmed.
              </small>
            </div>
          ) : kind === "hotel" ? (
            <div className="preview-calendar">
              <div className="preview-chart-title">
                <strong>Room availability</strong>
                <span>Sample week</span>
              </div>
              <div className="preview-room-grid">
                <span>Category</span>
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((v) => (
                  <span key={v}>{v}</span>
                ))}
                {["Deluxe", "Suite", "Family"].map((r, i) => (
                  <div className="preview-room-row" key={r}>
                    <strong>{r}</strong>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <span
                        key={n}
                        className={
                          (n + i) % 3 === 0 ? "room-booked" : "room-open"
                        }
                      >
                        {(n + i) % 3 === 0 ? "Held" : "Open"}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <p>
                <span className="preview-dot" /> Temporary holds protect
                available inventory.
              </p>
            </div>
          ) : kind === "transport" ? (
            <div className="preview-trips">
              <div className="preview-chart-title">
                <strong>Upcoming charters</strong>
                <span>Full vehicle bookings</span>
              </div>
              {[
                ["Delhi → Manali", "35 seats", "Supplier review"],
                ["Chandigarh → Shimla", "26 seats", "Confirmed"],
                ["Delhi → Jaipur", "4 seats", "Draft quote"],
              ].map(([r, c, s], i) => (
                <div className="preview-trip" key={r}>
                  <b>{String(i + 1).padStart(2, "0")}</b>
                  <span>
                    <strong>{r}</strong>
                    <small>{c} · Demo trip</small>
                  </span>
                  <em>{s}</em>
                </div>
              ))}
            </div>
          ) : kind === "quotation" ? (
            <div className="preview-quote">
              <div className="preview-chart-title">
                <strong>Manali mountain escape</strong>
                <span>Quotation draft</span>
              </div>
              {[
                ["Accommodation", "₹24,000"],
                ["Private transfers", "₹10,000"],
                ["Activities & services", "₹5,000"],
              ].map(([t, v]) => (
                <p key={t}>
                  <span>{t}</span>
                  <strong>{v}</strong>
                </p>
              ))}
              <p className="quote-total">
                <span>Estimated contribution</span>
                <strong>₹9,000</strong>
              </p>
              <small>
                Illustrative, excluding applicable taxes. Approval required.
              </small>
            </div>
          ) : (
            <>
              <div className="preview-chart">
                <div className="preview-chart-title">
                  <strong>
                    {kind === "intelligence"
                      ? "Booking demand outlook"
                      : "Booking activity"}
                  </strong>
                  <span>
                    <i />{" "}
                    {kind === "intelligence"
                      ? "Illustrative forecast"
                      : "Sample bookings"}
                  </span>
                </div>
                <svg
                  viewBox="0 0 440 133"
                  role="img"
                  aria-label={
                    kind === "intelligence"
                      ? "Illustrative forecast with uncertainty band; not a validated prediction"
                      : "Fictional booking activity chart"
                  }
                >
                  <defs>
                    <linearGradient
                      id={`fill-${instance}-${kind}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop stopColor="#8b66ef" stopOpacity=".28" />
                      <stop offset="1" stopColor="#8b66ef" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[25, 65, 105].map((y) => (
                    <path
                      key={y}
                      d={`M 0 ${y} H 440`}
                      stroke="#eaeaf3"
                      strokeDasharray="3 4"
                    />
                  ))}
                  {kind === "intelligence" && (
                    <path
                      d="M220 75 L270 49 L320 57 L370 28 L440 12 L440 77 L370 88 L320 100 L270 91 Z"
                      fill="#e5dcfa"
                    />
                  )}
                  <path
                    d="M0 108 C30 108 36 68 65 80 S110 101 135 62 S178 86 205 61 S246 89 275 54 S316 68 343 43 S388 55 440 20 L440 133 L0 133 Z"
                    fill={`url(#fill-${instance}-${kind})`}
                  />
                  <path
                    d="M0 108 C30 108 36 68 65 80 S110 101 135 62 S178 86 205 61 S246 89 275 54 S316 68 343 43 S388 55 440 20"
                    fill="none"
                    stroke="#8153e5"
                    strokeWidth="3"
                  />
                </svg>
                <div className="preview-chart-axis">
                  {["Week 1", "Week 2", "Week 3", "Week 4"].map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                {kind === "intelligence" && (
                  <small className="preview-model-note">
                    Illustrative outlook · real forecasts require sufficient
                    history and backtesting.
                  </small>
                )}
              </div>
              <div className="preview-task">
                <span>
                  <MessageSquare size={14} />{" "}
                  {kind === "intelligence"
                    ? "Your next best question"
                    : "Next on your list"}
                </span>
                <strong>
                  {kind === "intelligence"
                    ? "Which packages contribute the most?"
                    : "Review today’s enquiries"}
                </strong>
                <ArrowUpRight size={15} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
