"use client";
import { useEffect, useRef, useState } from "react";
import type { Dataset } from "@/lib/data";
import { readApiJson } from "@/lib/api-response";
import { inr } from "@/lib/money";
import {
  itineraryPayloadSchema,
  itineraryTotals,
  type ItineraryPayload,
} from "@/lib/workspace-operations/itinerary-format";
type Row = {
  id: string;
  leadId: string;
  packageId: string | null;
  title: string;
  revision: number;
};
type Detail = Row & {
  payload: ItineraryPayload;
  canEdit: boolean;
  canViewCosts: boolean;
  totals: { total: number; selling: number; net: number; tax: number };
};
type Version = { id: string; revision: number; createdAt: string };
export default function ItineraryBuilder({
  data,
  onQuote,
  onDirtyChange,
}: {
  data: Dataset;
  onDirtyChange: (value: boolean) => void;
  onQuote: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [doc, setDoc] = useState<Detail | null>(null),
    [versions, setVersions] = useState<Version[]>([]),
    [historical, setHistorical] = useState(false),
    [leadId, setLeadId] = useState(data.leads[0]?.id || ""),
    [packageId, setPackageId] = useState(data.packages[0]?.id || ""),
    [payload, setPayload] = useState<ItineraryPayload | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [saved, setSaved] = useState("");
  const request = useRef<{ body: string; id: string } | null>(null),
    generation = useRef(0);
  const costs = data.access.canViewCosts,
    dirty = !!payload && JSON.stringify(payload) !== saved;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  async function api<T>(query = "", body?: unknown) {
    return readApiJson<T>(
      await fetch(
        "/api/workspace/operations" + query,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : { cache: "no-store" },
      ),
    );
  }
  async function list(p = page) {
    const r = await api<{ itineraries: Row[]; hasMore: boolean }>("?page=" + p);
    setRows(r.itineraries);
    setMore(r.hasMore);
  }
  useEffect(() => {
    void list(page).catch((e) => setError(e.message));
  }, [page]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function open(id: string, version?: string, force = false) {
    if (!force && dirty && !window.confirm("Discard unsaved itinerary edits?"))
      return;
    const g = ++generation.current;
    setError("");
    setBusy(true);
    try {
      const r = await api<{
        itinerary: Detail;
        versions: Version[];
        historical: boolean;
      }>(
        "?id=" +
          encodeURIComponent(id) +
          (version ? "&version=" + encodeURIComponent(version) : ""),
      );
      if (g !== generation.current) return;
      setDoc(r.itinerary);
      setPayload(r.itinerary.payload);
      setSaved(JSON.stringify(r.itinerary.payload));
      setVersions(r.versions);
      setHistorical(r.historical);
      setLeadId(r.itinerary.leadId);
      setPackageId(r.itinerary.packageId || "");
      setReviewed(false);
      request.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  async function start() {
    if (dirty && !window.confirm("Discard unsaved itinerary edits?")) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ payload: ItineraryPayload; message: string }>("", {
        action: "template",
        leadId,
        packageId,
      });
      setDoc(null);
      setPayload(r.payload);
      setSaved("");
      setVersions([]);
      setHistorical(false);
      setReviewed(false);
      setNotice(r.message);
      request.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(next: ItineraryPayload) {
    setPayload(next);
    setReviewed(false);
    setNotice("");
  }
  async function save() {
    if (!payload) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const valid = itineraryPayloadSchema.parse(payload);
      itineraryTotals(valid);
      const command = {
        action: "save",
        ...(doc ? { id: doc.id } : {}),
        revision: doc?.revision ?? 0,
        leadId,
        packageId: packageId || null,
        payload: valid,
      };
      const body = JSON.stringify(command);
      if (request.current?.body !== body)
        request.current = { body, id: crypto.randomUUID() };
      const r = await api<{ id: string }>("", {
        ...command,
        requestId: request.current.id,
      });
      setSaved(JSON.stringify(valid));
      setPayload(null);
      await open(r.id, undefined, true);
      await list();
      setNotice("Version saved. Draft only; no inventory has been reserved.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Save failed. Check history before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  let total: ReturnType<typeof itineraryTotals> | null = null;
  try {
    if (payload && costs) total = itineraryTotals(payload);
  } catch {}
  const editable = !busy && !historical && (doc?.canEdit ?? true),
    currentVersion = versions.find((v) => v.revision === doc?.revision);
  return (
    <section className="ops-workspace">
      <div className="panel ops-no-print">
        <h2>Itineraries & costing</h2>
        <p>
          Versioned working drafts. Review dates, package terms, supplier prices
          and availability before issuing a quotation.
        </p>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="info-box">
            {notice}
          </p>
        )}
        <div className="ops-fields">
          <label>
            Enquiry
            <select
              disabled={busy || !!payload}
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
            >
              {data.leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.customer} · {l.destination}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source package
            <select
              disabled={busy || !!payload}
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            >
              {data.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn primary"
            disabled={busy || !leadId || !packageId || !!payload}
            onClick={() => void start()}
          >
            New itinerary from package
          </button>
          {payload && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => {
                if (!dirty || window.confirm("Discard unsaved edits?")) {
                  setPayload(null);
                  setDoc(null);
                  setSaved("");
                  setReviewed(false);
                }
              }}
            >
              Close editor
            </button>
          )}
        </div>
        <div className="ops-customer-grid">
          {rows.map((r) => (
            <button
              key={r.id}
              className="ops-record"
              disabled={busy}
              onClick={() => void open(r.id)}
            >
              <strong>{r.title}</strong>
              <span>Version {r.revision + 1}</span>
            </button>
          ))}
        </div>
        <div className="ops-actions">
          <button
            className="btn secondary"
            disabled={!page || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous drafts
          </button>
          <span>Page {page + 1}</span>
          <button
            className="btn secondary"
            disabled={!more || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next drafts
          </button>
        </div>
      </div>
      {payload && (
        <div className="panel">
          <div className="ops-no-print ops-actions">
            <button
              className="btn primary"
              disabled={!editable || !dirty}
              onClick={() => void save()}
            >
              Save version
            </button>
            <button
              className="btn secondary"
              disabled={dirty || busy}
              onClick={() => window.print()}
            >
              Print itinerary / save PDF
            </button>
            {versions.length > 0 && (
              <label>
                Version history
                <select
                  disabled={busy}
                  value={historical ? currentVersion?.id || "" : "current"}
                  onChange={(e) =>
                    void open(
                      doc!.id,
                      e.target.value === "current" ? undefined : e.target.value,
                    )
                  }
                >
                  <option value="current">Current version</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      Version {v.revision + 1} ·{" "}
                      {new Date(v.createdAt).toLocaleString("en-IN")}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {historical && <strong>Historical version · read only</strong>}
          </div>
          <div className="ops-itinerary-print">
            <header className="ops-print-heading">
              <strong>{data.agency.name}</strong>
              <span>
                Travel itinerary · reviewed draft{" "}
                {doc ? `v${doc.revision + 1}` : "unsaved"}
              </span>
            </header>
            <fieldset className="ops-screen-editor" disabled={!editable}>
              <div className="ops-fields">
                <label>
                  Itinerary title
                  <input
                    value={payload.title}
                    maxLength={180}
                    onChange={(e) =>
                      edit({ ...payload, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Start
                  <input
                    type="date"
                    value={payload.startDate}
                    onChange={(e) =>
                      edit({ ...payload, startDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  End
                  <input
                    type="date"
                    value={payload.endDate}
                    onChange={(e) =>
                      edit({ ...payload, endDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Travellers
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={payload.travellers}
                    onChange={(e) =>
                      edit({ ...payload, travellers: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              {payload.days.map((d, i) => (
                <section className="ops-day" key={i}>
                  <h3>Day {d.day}</h3>
                  <label>
                    Title
                    <input
                      value={d.title}
                      maxLength={150}
                      onChange={(e) =>
                        edit({
                          ...payload,
                          days: payload.days.map((x, j) =>
                            j === i ? { ...x, title: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Activities & timings
                    <textarea
                      value={d.notes}
                      maxLength={3000}
                      onChange={(e) =>
                        edit({
                          ...payload,
                          days: payload.days.map((x, j) =>
                            j === i ? { ...x, notes: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Overnight
                    <input
                      value={d.overnight}
                      maxLength={150}
                      onChange={(e) =>
                        edit({
                          ...payload,
                          days: payload.days.map((x, j) =>
                            j === i ? { ...x, overnight: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="btn secondary small ops-no-print"
                    type="button"
                    onClick={() =>
                      edit({
                        ...payload,
                        days: payload.days
                          .filter((_, j) => j !== i)
                          .map((x, j) => ({ ...x, day: j + 1 })),
                      })
                    }
                    disabled={payload.days.length === 1}
                  >
                    Remove day
                  </button>
                </section>
              ))}
              <button
                className="btn secondary ops-no-print"
                type="button"
                disabled={payload.days.length >= 60}
                onClick={() =>
                  edit({
                    ...payload,
                    days: [
                      ...payload.days,
                      {
                        day: payload.days.length + 1,
                        title: "New day",
                        notes: "",
                        overnight: "",
                      },
                    ],
                  })
                }
              >
                Add day
              </button>
              {(["inclusions", "exclusions", "terms"] as const).map((k) => (
                <label key={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                  <textarea
                    value={payload[k]}
                    maxLength={k === "terms" ? 6000 : 5000}
                    onChange={(e) => edit({ ...payload, [k]: e.target.value })}
                  />
                </label>
              ))}
            </fieldset>
            <div className="ops-print-document">
              <h1>{payload.title}</h1>
              <p>
                {payload.startDate} → {payload.endDate} · {payload.travellers}{" "}
                travellers
              </p>
              {payload.days.map((d) => (
                <section key={d.day}>
                  <h2>
                    Day {d.day} · {d.title}
                  </h2>
                  <p className="ops-preserve-lines">{d.notes}</p>
                  {d.overnight && <p>Overnight: {d.overnight}</p>}
                </section>
              ))}
              {(["inclusions", "exclusions", "terms"] as const).map((k) => (
                <section key={k}>
                  <h2>{k[0].toUpperCase() + k.slice(1)}</h2>
                  <p className="ops-preserve-lines">{payload[k]}</p>
                </section>
              ))}
            </div>
            <p>
              Travel plan only. Supplier availability, final quotation and
              booking confirmation are separate.
            </p>
          </div>
          {costs && (
            <fieldset
              disabled={!editable}
              className="ops-private-costs ops-no-print"
            >
              <legend>Private supplier costing (₹)</legend>
              {payload.costs.map((c, i) => (
                <div className="ops-fields" key={i}>
                  <label>
                    Item
                    <input
                      value={c.label}
                      maxLength={150}
                      onChange={(e) =>
                        edit({
                          ...payload,
                          costs: payload.costs.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={c.kind}
                      onChange={(e) =>
                        edit({
                          ...payload,
                          costs: payload.costs.map((x, j) =>
                            j === i
                              ? { ...x, kind: e.target.value as typeof c.kind }
                              : x,
                          ),
                        })
                      }
                    >
                      {[
                        "Accommodation",
                        "Transport",
                        "Activities",
                        "Other",
                      ].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={c.quantity}
                      onChange={(e) =>
                        edit({
                          ...payload,
                          costs: payload.costs.map((x, j) =>
                            j === i
                              ? { ...x, quantity: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Unit cost ₹
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={c.unitCostPaise / 100}
                      onChange={(e) =>
                        edit({
                          ...payload,
                          costs: payload.costs.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  unitCostPaise: Math.round(
                                    Number(e.target.value) * 100,
                                  ),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={() =>
                      edit({
                        ...payload,
                        costs: payload.costs.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove item
                  </button>
                </div>
              ))}
              <button
                className="btn secondary"
                type="button"
                disabled={payload.costs.length >= 60}
                onClick={() =>
                  edit({
                    ...payload,
                    costs: [
                      ...payload.costs,
                      {
                        label: "Supplier item",
                        kind: "Other",
                        quantity: 1,
                        unitCostPaise: 0,
                      },
                    ],
                  })
                }
              >
                Add cost item
              </button>
              <div className="ops-fields">
                <label>
                  Markup %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={payload.markupBps / 100}
                    onChange={(e) =>
                      edit({
                        ...payload,
                        markupBps: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
                <label>
                  Discount ₹
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payload.discountPaise / 100}
                    onChange={(e) =>
                      edit({
                        ...payload,
                        discountPaise: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
                <label>
                  Tax %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={payload.taxBps / 100}
                    onChange={(e) =>
                      edit({
                        ...payload,
                        taxBps: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
              </div>
              {total ? (
                <p>
                  Cost {inr(total.supplierCost)} · selling before discount{" "}
                  {inr(total.selling)} · tax {inr(total.tax)} · customer total{" "}
                  {inr(total.total)} · estimated contribution{" "}
                  {inr(total.contribution)}
                </p>
              ) : (
                <p role="alert">Review amounts and discount before saving.</p>
              )}
            </fieldset>
          )}
          {!costs && doc && !doc.canEdit && (
            <p>
              Private-costed itinerary: a manager must edit this document.
              Customer total: {inr(doc.totals.total)}.
            </p>
          )}
          {costs && doc && !historical && (
            <div className="ops-no-print">
              <label className="ops-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={dirty || busy}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed this saved version, prices, travel dates and source
                package payment/cancellation terms.
              </label>
              <button
                className="btn primary"
                disabled={
                  busy || dirty || !reviewed || !currentVersion || !total?.total
                }
                onClick={async () => {
                  if (!currentVersion) return;
                  setBusy(true);
                  try {
                    if (
                      await onQuote({
                        leadId,
                        packageId,
                        itineraryVersionId: currentVersion.id,
                        itineraryReviewed: true,
                        discount: "0",
                        tax: "0",
                      })
                    )
                      setNotice(
                        "Draft quotation created. Open Quotations to review and send it.",
                      );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Create itemized draft quotation
              </button>
              <p>
                One quotation per itinerary version; reusing this action opens
                the existing draft path. A draft does not confirm a booking.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
