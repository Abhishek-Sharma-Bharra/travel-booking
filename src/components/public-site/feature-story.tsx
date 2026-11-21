"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BarChart3, FileText, Users } from "lucide-react";
import ProductPreview, { type PreviewKind } from "./product-preview";
const stories = [
  {
    title: "A pipeline with a personal touch.",
    label: "Leads & follow-ups",
    copy: "Keep customer requirements, next steps and conversations together. Know who needs a response, without piecing together scattered notes.",
    kind: "agency" as PreviewKind,
    icon: Users,
  },
  {
    title: "Quotes with the details covered.",
    label: "Quotations & costing",
    copy: "Bring package costs, inclusions and your margin into a considered quotation. Review the numbers, then share a branded print or PDF.",
    kind: "quotation" as PreviewKind,
    icon: FileText,
  },
  {
    title: "A clearer picture of your business.",
    label: "Reports & contribution",
    copy: "Understand collections, supplier costs and package contribution. Use reports with clear definitions, rather than unsupported promises.",
    kind: "intelligence" as PreviewKind,
    icon: BarChart3,
  },
];
export default function FeatureStory() {
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const manuallySelected = useRef(false);
  useEffect(() => {
    const resumeScroll = () => {
      manuallySelected.current = false;
    };
    const resumeKeyboardScroll = (event: KeyboardEvent) => {
      if (
        ["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"].includes(
          event.key,
        )
      )
        resumeScroll();
    };
    window.addEventListener("wheel", resumeScroll, { passive: true });
    window.addEventListener("touchmove", resumeScroll, { passive: true });
    window.addEventListener("keydown", resumeKeyboardScroll);
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          manuallySelected.current ||
          !matchMedia("(min-width: 900px)").matches
        )
          return;
        const entry = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (entry)
          setSelected(Number((entry.target as HTMLElement).dataset.story));
      },
      { rootMargin: "-20% 0px -25% 0px", threshold: [0.35, 0.65] },
    );
    root.current
      ?.querySelectorAll("[data-story]")
      .forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      window.removeEventListener("wheel", resumeScroll);
      window.removeEventListener("touchmove", resumeScroll);
      window.removeEventListener("keydown", resumeKeyboardScroll);
    };
  }, []);
  return (
    <div className="saas-feature-story" ref={root}>
      <div className="story-steps">
        {stories.map((s, i) => (
          <button
            key={s.kind}
            type="button"
            id={`story-${i}`}
            data-story={i}
            className={selected === i ? "is-active" : ""}
            aria-pressed={selected === i}
            aria-controls="feature-story-preview"
            onClick={() => {
              manuallySelected.current = true;
              setSelected(i);
            }}
          >
            <span className="story-step-icon">
              <s.icon size={20} />
            </span>
            <span>
              <small>
                0{i + 1} / {s.label}
              </small>
              <strong>{s.title}</strong>
              <span>{s.copy}</span>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      <div
        id="feature-story-preview"
        className="story-preview"
        role="region"
        aria-labelledby={`story-${selected}`}
      >
        <ProductPreview instance="story" kind={stories[selected].kind} />
        <p>
          <span className="preview-dot" /> A product illustration. Figures and
          names are fictional.
        </p>
      </div>
    </div>
  );
}
