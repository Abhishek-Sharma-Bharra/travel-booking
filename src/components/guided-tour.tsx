"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X, Compass, ChevronDown } from "lucide-react";
import { tourSteps } from "@/lib/tour-steps";
export default function GuidedTour({
  role,
  demo,
  navigate,
  canAutoStart,
}: {
  role: string;
  demo: boolean;
  navigate: (page: string) => void;
  canAutoStart: () => boolean;
}) {
  const [step, setStep] = useState(0),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    cardTop: number;
    cardLeft: number;
    cardWidth: number;
  } | null>(null);
  const panel = useRef<HTMLElement>(null),
    navigateRef = useRef(navigate),
    stepRef = useRef(step),
    skipRef = useRef(() => {});
  const autoPending = useRef(false),
    canAutoStartRef = useRef(canAutoStart);
  canAutoStartRef.current = canAutoStart;
  navigateRef.current = navigate;
  stepRef.current = step;
  const steps = tourSteps(role),
    selected = steps[step] || steps[0];
  useEffect(() => {
    if (demo) return;
    const c = new AbortController();
    void (async () => {
      try {
        const r = await fetch("/api/tour", {
          cache: "no-store",
          signal: c.signal,
        });
        if (!r.ok) return;
        const b = await r.json();
        if (
          (!b.progress || b.progress.status === "ACTIVE") &&
          canAutoStartRef.current()
        ) {
          autoPending.current = true;
          setStep(b.progress?.step ?? 0);
          setOpen(true);
        }
      } catch {
        /* A failed tour read must never block the CRM. */
      }
    })();
    return () => c.abort();
  }, [demo, role]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skipRef.current();
      }
      if (e.key === "Tab") {
        const els = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled])",
          ) ?? [],
        );
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (autoPending.current && !canAutoStartRef.current()) {
      autoPending.current = false;
      setOpen(false);
      return;
    }
    autoPending.current = false;
    navigateRef.current(selected.page);
    setPlacement(null);
    let frame = 0;
    let searchFrame = 0;
    let target: HTMLElement | null = null;
    let observer: ResizeObserver | undefined;
    let tries = 0;
    const measure = () => {
      if (!target) return;
      const r = target.getBoundingClientRect();
      const vw = document.documentElement.clientWidth,
        vh = window.innerHeight;
      const top = Math.max(6, r.top - 5),
        left = Math.max(6, r.left - 5);
      const width = Math.max(0, Math.min(vw - 6, r.right + 5) - left);
      const height = Math.max(0, Math.min(vh - 6, r.bottom + 5) - top);
      const cardWidth = Math.min(328, vw - 24),
        cardHeight = panel.current?.offsetHeight ?? 350;
      const cardLeft = Math.max(12, Math.min(left, vw - cardWidth - 12));
      const below = top + height + 15;
      const above = top - cardHeight - 15;
      const cardTop =
        vw < 700
          ? Math.max(12, vh - cardHeight - 12)
          : below + cardHeight <= vh - 12
            ? below
            : above >= 12
              ? above
              : Math.max(12, vh - cardHeight - 12);
      setPlacement({ top, left, width, height, cardTop, cardLeft, cardWidth });
    };
    const schedule = () => {
      if (!target) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const findTarget = () => {
      target = document.querySelector<HTMLElement>(
        `[data-tour-page="${selected.page}"]`,
      );
      if (!target) {
        if (tries++ < 30) searchFrame = requestAnimationFrame(findTarget);
        return;
      }
      target.classList.add("tour-highlight");
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY + target.getBoundingClientRect().top - 18,
        ),
        left: 0,
        behavior: "instant",
      });
      measure();
      observer = new ResizeObserver(schedule);
      observer.observe(target);
      if (panel.current) observer.observe(panel.current);
    };
    searchFrame = requestAnimationFrame(findTarget);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(searchFrame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      target?.classList.remove("tour-highlight");
    };
  }, [open, selected.page]);
  async function save(next: number, status: "ACTIVE" | "SKIPPED" | "COMPLETE") {
    setBusy(true);
    setError("");
    try {
      if (!demo) {
        const r = await fetch("/api/tour", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: next, status }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) {
          const b = await r.json();
          throw Error(b.error || "Tour progress could not be saved");
        }
      }
      setStep(next);
      if (status !== "ACTIVE") setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  skipRef.current = () => {
    if (!busy) void save(stepRef.current, "SKIPPED");
  };
  return (
    <>
      <button
        className="btn tour-trigger"
        onClick={() => {
          autoPending.current = false;
          setStep(0);
          setError("");
          setOpen(true);
        }}
        disabled={open}
      >
        <Compass size={15} /> Take a Tour <ChevronDown size={13} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="tour-layer tour-anchored">
            {placement ? (
              <div className="tour-shades" aria-hidden="true">
                <div
                  style={{ top: 0, left: 0, right: 0, height: placement.top }}
                />
                <div
                  style={{
                    top: placement.top + placement.height,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                />
                <div
                  style={{
                    top: placement.top,
                    left: 0,
                    width: placement.left,
                    height: placement.height,
                  }}
                />
                <div
                  style={{
                    top: placement.top,
                    left: placement.left + placement.width,
                    right: 0,
                    height: placement.height,
                  }}
                />
                <span
                  className="tour-spotlight"
                  style={{
                    top: placement.top,
                    left: placement.left,
                    width: placement.width,
                    height: placement.height,
                  }}
                />
              </div>
            ) : (
              <div className="tour-wait-shade" aria-hidden="true" />
            )}
            <section
              className="tour-card"
              role="dialog"
              aria-modal="true"
              aria-label="Workspace tour"
              aria-describedby="workspace-tour-description"
              ref={panel}
              tabIndex={-1}
              style={
                placement
                  ? {
                      top: placement.cardTop,
                      left: placement.cardLeft,
                      width: placement.cardWidth,
                    }
                  : undefined
              }
            >
              <div className="tour-card-top">
                <p>
                  STEP {step + 1} OF {steps.length}
                </p>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close tour"
                  disabled={busy}
                  onClick={() => void save(step, "SKIPPED")}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="tour-context">
                <span className="tour-compass">
                  <Compass size={18} />
                </span>
                <span>Welcome to TravelOS</span>
              </div>
              <h2>{selected.title}</h2>
              <p id="workspace-tour-description">{selected.text}</p>
              <div className="tour-screen-note">
                <span>{role}</span> · {selected.page}
              </div>
              {error && (
                <p role="alert" className="error-box">
                  {error}
                </p>
              )}
              <div className="tour-progress" aria-label="Tour progress">
                {steps.map((s, i) => (
                  <span
                    key={s.page}
                    className={i === step ? "active" : ""}
                    aria-current={i === step ? "step" : undefined}
                  >
                    <span className="sr-only">
                      Step {i + 1}: {s.title}
                    </span>
                  </span>
                ))}
              </div>
              <div className="tour-actions">
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void save(step, "SKIPPED")}
                >
                  Skip tour
                </button>
                <span />
                <button
                  className="btn"
                  disabled={busy || step === 0}
                  onClick={() => void save(step - 1, "ACTIVE")}
                >
                  Back
                </button>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      Math.min(step + 1, steps.length - 1),
                      step === steps.length - 1 ? "COMPLETE" : "ACTIVE",
                    )
                  }
                >
                  {step === steps.length - 1 ? "Finish tour" : "Next step"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
