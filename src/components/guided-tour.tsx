"use client";
import { useEffect, useRef, useState } from "react";
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
    const timer = setTimeout(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-tour-page="${selected.page}"]`,
      );
      target?.classList.add("tour-highlight");
      target?.scrollIntoView({ block: "start", behavior: "instant" });
    }, 50);
    return () => {
      clearTimeout(timer);
      document
        .querySelectorAll(".tour-highlight")
        .forEach((x) => x.classList.remove("tour-highlight"));
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
        className="btn"
        onClick={() => {
          autoPending.current = false;
          setStep(0);
          setError("");
          setOpen(true);
        }}
        disabled={open}
      >
        Take a Tour
      </button>
      {open && (
        <div className="tour-layer">
          <section
            className="tour-card"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace tour"
            ref={panel}
            tabIndex={-1}
          >
            <p className="eyebrow">
              TAKE A TOUR · {role} · {step + 1} / {steps.length}
            </p>
            <h2>{selected.title}</h2>
            <p>{selected.text}</p>
            <p className="muted">
              Screen: {selected.page}. No business records are changed by this
              walkthrough.
            </p>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <div className="tour-actions">
              <button
                className="btn"
                disabled={busy}
                onClick={() => void save(step, "SKIPPED")}
              >
                Skip tour
              </button>
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
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
