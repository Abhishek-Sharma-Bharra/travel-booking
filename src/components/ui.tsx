"use client";
import { useRef, useEffect } from "react";
import { X, Download } from "lucide-react";
import { safeCsv } from "@/lib/validation";
export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
};
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    (focusables()[0] ?? dialogRef.current)?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key === "Tab") {
        const els = focusables(),
          first = els[0],
          last = els.at(-1);
        if (!first) {
          e.preventDefault();
          dialogRef.current?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Fields({
  fields,
  values = {},
}: {
  fields: Field[];
  values?: Record<string, unknown>;
}) {
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <label key={f.name} className={f.type === "textarea" ? "span-2" : ""}>
          {f.label}
          {f.required !== false && <span className="required"> *</span>}
          {f.options ? (
            <select
              name={f.name}
              required={f.required !== false}
              defaultValue={String(values[f.name] ?? "")}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              name={f.name}
              required={f.required !== false}
              defaultValue={String(values[f.name] ?? "")}
              rows={3}
              maxLength={2000}
            />
          ) : (
            <input
              name={f.name}
              type={f.type || "text"}
              required={f.required !== false}
              defaultValue={String(values[f.name] ?? "")}
              min={f.min}
              max={f.max}
              step={f.step ?? (f.type === "number" ? "1" : undefined)}
              maxLength={f.type === "password" ? 128 : 2000}
            />
          )}
          {f.hint && <small>{f.hint}</small>}
        </label>
      ))}
    </div>
  );
}
export function ExportButton({
  rows,
  name = "travelos-export",
}: {
  rows: Record<string, unknown>[];
  name?: string;
}) {
  return (
    <button
      className="btn secondary small"
      disabled={!rows.length}
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob(["\uFEFF" + safeCsv(rows)], {
            type: "text/csv;charset=utf-8",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = name + ".csv";
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      <Download size={15} />
      Export CSV
    </button>
  );
}
export function Empty({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span>✦</span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${["Won", "Confirmed", "Accepted", "Completed", "High", "Active"].includes(value) ? "green" : ["Lost", "Cancelled", "Overdue"].includes(value) ? "red" : ["Quoted", "Medium", "Pending", "Part confirmed"].includes(value) ? "amber" : "neutral"}`}
    >
      {value}
    </span>
  );
}
export function MiniBars({
  items,
}: {
  items: {
    label: string;
    value: number;
    secondary?: number;
    formatted?: string;
  }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="mini-bars">
      {items.map((i) => (
        <div key={i.label}>
          <div className="bar-label">
            <span>{i.label}</span>
            <strong>{i.formatted ?? i.value.toLocaleString("en-IN")}</strong>
          </div>
          <div className="bar-track">
            <span style={{ width: `${Math.max(0, (i.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
