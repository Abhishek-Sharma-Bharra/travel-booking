"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import ProductPreview, { type PreviewKind } from "./product-preview";
const slides: {
  label: string;
  title: string;
  accent: string;
  description: string;
  kind: PreviewKind;
  primary: string;
  href: string;
  note: string;
}[] = [
  {
    label: "01 / TRAVEL AGENCY CRM",
    title: "Less busywork.",
    accent: "More possibilities.",
    description:
      "An AI-ready travel agency CRM for the people behind every great journey. Bring your enquiries, quotations, bookings and collections into one considered workspace.",
    kind: "agency",
    primary: "Start free trial",
    href: "/login?signup=1",
    note: "14-day agency trial · No card required",
  },
  {
    label: "02 / AI BOOKING ASSISTANT",
    title: "Better conversations.",
    accent: "Clearer next steps.",
    description:
      "Turn customer questions into structured requirements and thoughtful drafts. Use published package details, verify prices and keep your team in control.",
    kind: "assistant",
    primary: "Meet your AI assistant",
    href: "#ai-agent",
    note: "Optional AI setup · You approve consequential actions",
  },
  {
    label: "03 / HOTEL MANAGEMENT",
    title: "A thoughtful stay.",
    accent: "Starts with you.",
    description:
      "Room categories, nightly rates, availability and guest requests—connected in a dedicated hotel workspace, with verified inventory before reservation.",
    kind: "hotel",
    primary: "Explore hotel workspace",
    href: "/hotel-business",
    note: "Property verification required before public listing",
  },
  {
    label: "04 / TRANSPORT MANAGEMENT",
    title: "Your fleet, ready.",
    accent: "Your day, organised.",
    description:
      "Give full bus charters and car rentals a clearer route from enquiry to trip. Manage vehicles, dates, driver assignments and supplier requests.",
    kind: "transport",
    primary: "Explore transport workspace",
    href: "/operator",
    note: "Full vehicle charters · Seat ticketing is not enabled",
  },
  {
    label: "05 / VASHISHT INTELLIGENCE",
    title: "Know your numbers.",
    accent: "See what’s next.",
    description:
      "Understand package contribution, collections and marketing performance. Explore labeled model previews while real forecasts are developed and validated.",
    kind: "intelligence",
    primary: "Explore intelligence",
    href: "#intelligence",
    note: "Demo model previews · No unsupported prediction claims",
  },
];
export default function HeroCarousel({
  hotelsEnabled,
}: {
  hotelsEnabled: boolean;
}) {
  const available = slides.filter((s) => hotelsEnabled || s.kind !== "hotel");
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(true),
    [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false),
    [reduced, setReduced] = useState(false),
    [visible, setVisible] = useState(true),
    [inView, setInView] = useState(true);
  const container = useRef<HTMLElement>(null),
    touch = useRef<{ x: number; y: number } | null>(null);
  const slide = available[index];
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
    };
    update();
    media.addEventListener("change", update);
    const visibility = () => setVisible(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([e]) =>
      setInView(e.isIntersecting),
    );
    if (container.current) observer.observe(container.current);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!playing || hover || focus || !visible || !inView || reduced) return;
    const timer = setTimeout(() => {
      // Observer delivery can lag behind a scroll/background transition.
      // Recheck at the point of rotation, not just when scheduling it.
      const bounds = container.current?.getBoundingClientRect();
      if (
        document.hidden ||
        !bounds ||
        bounds.bottom <= 0 ||
        bounds.top >= innerHeight
      )
        return;
      setIndex((i) => (i + 1) % available.length);
    }, 6000);
    return () => clearTimeout(timer);
  }, [
    index,
    playing,
    hover,
    focus,
    visible,
    inView,
    reduced,
    available.length,
  ]);
  function select(i: number) {
    setIndex((i + available.length) % available.length);
    setPlaying(false);
  }
  return (
    <section
      ref={container}
      className="hero saas-hero"
      aria-roledescription="carousel"
      aria-label="Product highlights"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setFocus(false);
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const t = e.changedTouches[0],
          dx = t.clientX - touch.current.x,
          dy = t.clientY - touch.current.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy))
          select(index + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          select(index + (e.key === "ArrowRight" ? 1 : -1));
        }
      }}
    >
      <div
        className="hero-copy"
        aria-live={playing ? "off" : "polite"}
        aria-atomic="true"
      >
        <span className="saas-pill">
          <Sparkles size={13} /> One platform. Every part of your travel
          business.
        </span>
        <p className="hero-product-category">{slide.label}</p>
        <h1 key={slide.kind}>
          {slide.title}
          <br />
          <em>{slide.accent}</em>
        </h1>
        <p className="saas-hero-description">{slide.description}</p>
        <div className="hero-actions">
          <a href={slide.href} className="btn primary">
            {slide.primary}
            <ArrowRight size={16} />
          </a>
          <a href="/demo" className="btn secondary">
            <Play size={14} /> Explore Demo
          </a>
        </div>
        <div className="hero-note">
          <Check size={14} />
          {slide.note}
        </div>
        <div className="saas-carousel-controls">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => select(index - 1)}
          >
            <ArrowLeft size={16} />
          </button>
          <div
            className="saas-carousel-dots"
            aria-label="Choose a product slide"
          >
            {available.map((s, i) => (
              <button
                type="button"
                key={s.kind}
                aria-label={`Show slide ${i + 1}: ${s.kind}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => select(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => select(index + 1)}
          >
            <ArrowRight size={16} />
          </button>
          <span className="carousel-count">
            {String(index + 1).padStart(2, "0")} /{" "}
            {String(available.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            aria-label={playing ? "Pause slideshow" : "Play slideshow"}
            onClick={() => setPlaying((p) => !p)}
            disabled={reduced}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>
      </div>
      <div className="saas-hero-visual">
        <div className="hero-orbit" aria-hidden="true" />
        <div className="hero-preview-frame" key={slide.kind}>
          <ProductPreview instance="hero" kind={slide.kind} />
        </div>
        <div className="hero-float-note">
          <span>
            <Check size={15} />
          </span>
          <div>
            <strong>Every detail, connected.</strong>
            <small>Enquiry → quotation → booking</small>
          </div>
        </div>
      </div>
      <a href="#product-overview" className="saas-scroll-cue">
        <ArrowDown size={13} /> Get to know your workspace
      </a>
    </section>
  );
}
