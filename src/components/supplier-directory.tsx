"use client";
import { useEffect, useRef, useState } from "react";
import { readApiJson } from "@/lib/api-response";
import { inr, paise } from "@/lib/money";
import {
  emptySupplierProfile,
  supplierProfileSchema,
  supplierKinds,
  type SupplierProfile,
} from "@/lib/suppliers/format";
import type { Dataset } from "@/lib/data";
type Row = {
  id: string;
  name: string;
  kind: string;
  city: string;
  status: string;
  revision: number;
  updatedAt: string;
};
type Version = {
  revision: number;
  createdAt: string;
  profile: SupplierProfile;
};
export default function SupplierDirectory({
  data,
  onDirtyChange,
}: {
  data: Dataset;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState<SupplierProfile | null>(null),
    [doc, setDoc] = useState<{ id: string; revision: number } | null>(null),
    [versions, setVersions] = useState<Version[]>([]),
    [version, setVersion] = useState<number | null>(null),
    [saved, setSaved] = useState(""),
    [rate, setRate] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [lastSaved, setLastSaved] = useState("");
  const request = useRef<{ body: string; id: string } | null>(null),
    generation = useRef(0);
  const dirty =
    !!draft &&
    (JSON.stringify(draft) !== saved ||
      rate !==
        (draft.contract.ratePaise === null
          ? ""
          : (draft.contract.ratePaise / 100).toFixed(2)));
  useEffect(() => {
    onDirtyChange(dirty || uncertain);
    return () => onDirtyChange(false);
  }, [dirty, uncertain, onDirtyChange]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || uncertain) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uncertain]);
  async function api<T>(query = "", body?: string) {
    return readApiJson<T>(
      await fetch(
        "/api/suppliers" + query,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            }
          : { cache: "no-store" },
      ),
    );
  }
  async function list(p = page) {
    const r = await api<{ suppliers: Row[]; hasMore: boolean }>(
      `?page=${p}&search=${encodeURIComponent(search)}`,
    );
    setRows(r.suppliers);
    setMore(r.hasMore);
  }
  useEffect(() => {
    if (data.demo || data.actor.role === "AGENT") return;
    let active = true;
    void api<{ suppliers: Row[]; hasMore: boolean }>(
      `?page=${page}&search=${encodeURIComponent(search)}`,
    )
      .then((r) => {
        if (active) {
          setRows(r.suppliers);
          setMore(r.hasMore);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [page, search, data.demo, data.actor.role]);
  const leave = () =>
    !(dirty || uncertain) ||
    window.confirm(
      uncertain
        ? "The prior save result is uncertain. Check saved directory records before creating another profile. Close this draft?"
        : "Discard unsaved supplier edits?",
    );
  function fresh() {
    if (!leave()) return;
    generation.current++;
    const p = emptySupplierProfile();
    setDraft(p);
    setDoc(null);
    setVersions([]);
    setVersion(null);
    setSaved(JSON.stringify(p));
    setRate("");
    setUncertain(false);
    request.current = null;
    setError("");
    setNotice("");
  }
  async function open(id: string) {
    if (!leave()) return;
    const g = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const r = await api<{
        supplier: Row & { profile: SupplierProfile };
        versions: Version[];
      }>("?id=" + encodeURIComponent(id));
      if (g !== generation.current) return;
      setDoc({ id: r.supplier.id, revision: r.supplier.revision });
      setDraft(r.supplier.profile);
      setSaved(JSON.stringify(r.supplier.profile));
      setRate(
        r.supplier.profile.contract.ratePaise === null
          ? ""
          : (r.supplier.profile.contract.ratePaise / 100).toFixed(2),
      );
      setVersions(r.versions);
      setVersion(null);
      setUncertain(false);
      request.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  function edit(p: SupplierProfile) {
    setDraft(p);
    setError("");
    setNotice("");
  }
  async function save() {
    if (!draft || busy || version !== null) return;
    setError("");
    let body: string;
    try {
      const profile = supplierProfileSchema.parse({
        ...draft,
        contract: {
          ...draft.contract,
          ratePaise: rate === "" ? null : paise(rate),
          rateUnit: rate === "" ? null : draft.contract.rateUnit || "NIGHT",
        },
      });
      const data = {
        ...(doc ? { id: doc.id } : {}),
        revision: doc?.revision ?? 0,
        profile,
      };
      body = JSON.stringify(data);
      if (!request.current || request.current.body !== body)
        request.current = { body, id: crypto.randomUUID() };
    } catch {
      setError(
        "Review supplier name, email, INR rate and contract dates/terms before saving.",
      );
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ id: string; revision: number }>(
        "",
        JSON.stringify({ ...JSON.parse(body), requestId: request.current!.id }),
      );
      setLastSaved(r.id);
      setNotice(
        `Supplier saved · revision ${r.revision}. The private contract record does not certify availability or create a supplier payment.`,
      );
      setDraft(null);
      setDoc(null);
      setVersions([]);
      setUncertain(false);
      request.current = null;
      void list().catch(() =>
        setError(
          "Save acknowledged. Refresh the directory to see the saved profile.",
        ),
      );
    } catch (e) {
      setUncertain(true);
      setError(
        (e as Error).message +
          " Retry the same request or review saved records before starting another profile.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (data.demo)
    return (
      <section className="panel">
        <h2>Supplier directory</h2>
        <p>
          The read-only demo retains its fictional supplier ledger. Private
          contact and contract records are available to live agency
          owners/managers.
        </p>
      </section>
    );
  if (data.actor.role === "AGENT") return null;
  const displayed =
    version === null
      ? draft
      : (versions.find((v) => v.revision === version)?.profile ?? null);
  return (
    <section
      className="ops-workspace supplier-directory"
      aria-label="Private supplier directory"
    >
      <div className="panel">
        <span className="eyebrow">PRIVATE AGENCY DIRECTORY</span>
        <h2>Suppliers & recorded contracts</h2>
        <p>
          Owner/manager access. Keep hotel, transport, DMC, sightseeing and
          guide contacts with versioned commercial notes. A recorded contract is
          your agency's record, not platform verification or a booking
          guarantee. Do not enter bank credentials or API keys.
        </p>
        <div className="ops-actions">
          <button
            className="btn primary"
            onClick={fresh}
            disabled={busy || !data.access.canWrite}
          >
            Add supplier
          </button>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void list().catch((e) => setError(e.message))}
          >
            Refresh directory
          </button>
          <label>
            Search supplier name or city
            <input
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {lastSaved && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void open(lastSaved)}
          >
            Open last saved supplier
          </button>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Kind / city</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    {r.kind}
                    <small>{r.city}</small>
                  </td>
                  <td>{r.status}</td>
                  <td>
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      onClick={() => void open(r.id)}
                    >
                      Open {r.name}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p>
            No supplier profiles match this view. Manual ledger entries below
            remain separate.
          </p>
        )}
        <div className="ops-actions">
          <button
            className="btn secondary"
            disabled={!page || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous suppliers
          </button>
          <span>Page {page + 1} · 200 profile limit</span>
          <button
            className="btn secondary"
            disabled={!more || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next suppliers
          </button>
        </div>
      </div>
      {displayed && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3>{doc ? "Review supplier profile" : "New supplier profile"}</h3>
          {versions.length > 0 && (
            <label>
              Contract/profile version
              <select
                value={version === null ? "current" : String(version)}
                onChange={(e) =>
                  setVersion(
                    e.target.value === "current"
                      ? null
                      : Number(e.target.value),
                  )
                }
              >
                <option value="current">
                  Current editable revision {doc?.revision}
                </option>
                {versions.map((v) => (
                  <option key={v.revision} value={v.revision}>
                    Read-only revision {v.revision} · {v.createdAt.slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {version !== null && (
            <p>
              Historical snapshot. Select the current revision to edit; no
              previous version is overwritten.
            </p>
          )}
          <fieldset
            disabled={
              busy || uncertain || version !== null || !data.access.canWrite
            }
            className="supplier-fields"
          >
            <div className="ops-form-grid">
              <label>
                Supplier name
                <input
                  required
                  maxLength={100}
                  value={displayed.name}
                  onChange={(e) => edit({ ...displayed, name: e.target.value })}
                />
              </label>
              <label>
                Supplier kind
                <select
                  value={displayed.kind}
                  onChange={(e) =>
                    edit({
                      ...displayed,
                      kind: e.target.value as SupplierProfile["kind"],
                    })
                  }
                >
                  {supplierKinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Supplier city
                <input
                  maxLength={100}
                  value={displayed.city}
                  onChange={(e) => edit({ ...displayed, city: e.target.value })}
                />
              </label>
              <label>
                Profile status
                <select
                  value={displayed.status}
                  onChange={(e) =>
                    edit({
                      ...displayed,
                      status: e.target.value as SupplierProfile["status"],
                    })
                  }
                >
                  <option>ACTIVE</option>
                  <option>ARCHIVED</option>
                </select>
              </label>
              <label>
                Contact person
                <input
                  maxLength={100}
                  value={displayed.contactName}
                  onChange={(e) =>
                    edit({ ...displayed, contactName: e.target.value })
                  }
                />
              </label>
              <label>
                Supplier email
                <input
                  type="email"
                  maxLength={254}
                  value={displayed.email}
                  onChange={(e) =>
                    edit({ ...displayed, email: e.target.value })
                  }
                />
              </label>
              <label>
                Supplier phone
                <input
                  maxLength={20}
                  value={displayed.phone}
                  onChange={(e) =>
                    edit({ ...displayed, phone: e.target.value })
                  }
                />
              </label>
              <label>
                Contract reference
                <input
                  maxLength={100}
                  value={displayed.contract.reference}
                  onChange={(e) =>
                    edit({
                      ...displayed,
                      contract: {
                        ...displayed.contract,
                        reference: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                Contract status
                <select
                  value={displayed.contract.status}
                  onChange={(e) =>
                    edit({
                      ...displayed,
                      contract: {
                        ...displayed.contract,
                        status: e.target
                          .value as SupplierProfile["contract"]["status"],
                      },
                    })
                  }
                >
                  <option>DRAFT</option>
                  <option>RECORDED</option>
                  <option>ARCHIVED</option>
                </select>
              </label>
              <label>
                Contract valid from
                <input
                  type="date"
                  value={displayed.contract.validFrom || ""}
                  onChange={(e) =>
                    edit({
                      ...displayed,
                      contract: {
                        ...displayed.contract,
                        validFrom: e.target.value || null,
                      },
                    })
                  }
                />
              </label>
              <label>
                Contract valid until
                <input
                  type="date"
                  value={displayed.contract.validUntil || ""}
                  onChange={(e) =>
                    edit({
                      ...displayed,
                      contract: {
                        ...displayed.contract,
                        validUntil: e.target.value || null,
                      },
                    })
                  }
                />
              </label>
              <label>
                Negotiated rate (INR, optional)
                <input
                  inputMode="decimal"
                  value={
                    version === null
                      ? rate
                      : displayed.contract.ratePaise === null
                        ? ""
                        : (displayed.contract.ratePaise / 100).toFixed(2)
                  }
                  onChange={(e) => setRate(e.target.value)}
                />
              </label>
              <label>
                Rate unit
                <select
                  value={displayed.contract.rateUnit || "NIGHT"}
                  onChange={(e) =>
                    edit({
                      ...displayed,
                      contract: {
                        ...displayed.contract,
                        rateUnit: e.target
                          .value as SupplierProfile["contract"]["rateUnit"],
                      },
                    })
                  }
                >
                  {["NIGHT", "TRIP", "PERSON", "KM"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
            </div>
            {(
              [
                ["Payment terms", "paymentTerms"],
                ["Cancellation terms", "cancellationTerms"],
                ["Rate conditions and tax notes", "rateNotes"],
              ] as const
            ).map(([title, key]) => (
              <label key={key}>
                {title}
                <textarea
                  maxLength={1500}
                  value={displayed.contract[key]}
                  onChange={(e) =>
                    edit({
                      ...displayed,
                      contract: {
                        ...displayed.contract,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
            <label>
              Private supplier notes
              <textarea
                maxLength={1500}
                value={displayed.notes}
                onChange={(e) => edit({ ...displayed, notes: e.target.value })}
              />
            </label>
          </fieldset>
          <p>
            Rates are commercial records only. Current supplier availability,
            tax treatment and final booking prices require independent review.
            Saving does not send messages, create an order or move money.
          </p>
          <div className="ops-actions">
            <button
              className="btn primary"
              type="submit"
              disabled={busy || version !== null || !data.access.canWrite}
            >
              {busy
                ? "Saving…"
                : uncertain
                  ? "Retry same supplier request"
                  : "Save supplier profile"}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                if (leave()) {
                  setDraft(null);
                  setVersions([]);
                  setUncertain(false);
                  request.current = null;
                }
              }}
            >
              Close draft and review directory
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
