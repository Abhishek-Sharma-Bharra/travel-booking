"use client";
import { readApiJson } from "@/lib/api-response";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import HotelBookingConsole from "./hotel-booking-console";
import { HotelBrandHeader, HotelWelcomeImage } from "./hotel-brand";
import { Building2, Plus, ShieldCheck } from "lucide-react";
import type { hotelOverview } from "@/lib/hotels/service";
type Overview = Awaited<ReturnType<typeof hotelOverview>>;
type Property = Overview["hotels"][number];
const emptyProfile = {
  name: "",
  address: "",
  city: "",
  region: "",
  countryCode: "IN",
  postalCode: "",
  timezone: "Asia/Kolkata",
  contactEmail: "",
  contactPhone: "",
  amenities: [] as string[],
  photoUrls: [] as string[],
  policies: "",
  cancellationPolicy: "",
  taxBps: 0,
};
const list = (value: FormDataEntryValue | null) =>
  String(value || "")
    .split(/\n/)
    .map((v) => v.trim())
    .filter(Boolean);
export default function HotelConsole({
  initial,
  email,
}: {
  initial: Overview;
  email: string;
}) {
  const [data, setData] = useState(initial),
    [selected, setSelected] = useState(initial.hotels[0]?.id || ""),
    [creating, setCreating] = useState(!initial.hotels.length),
    [tab, setTab] = useState("Profile"),
    [roomId, setRoomId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const hotel = data.hotels.find((h) => h.id === selected),
    editable =
      creating ||
      !!(
        hotel &&
        ["OWNER", "MANAGER"].includes(hotel.role) &&
        hotel.status !== "SUSPENDED"
      );
  async function act(body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/hotelier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        result = await readApiJson<{ hotelId: string; error?: string }>(r);
      if (!r.ok) throw Error(result.error || "Could not save hotel");
      const fresh = await fetch("/api/hotelier", { cache: "no-store" }),
        next = await readApiJson<Overview & { error?: string }>(fresh);
      if (!fresh.ok)
        throw Error(
          next.error || "Saved, but refresh failed. Reload before retrying",
        );
      setData(next);
      setSelected(result.hotelId);
      setCreating(false);
      setRoomId("");
      setNotice(
        data.inventoryEnabled
          ? "Saved. Profile/category changes require platform verification before public listing. Inventory and checkout remain subject to hotel approval and payment setup."
          : "Saved. Publication requires platform verification; booking is not enabled.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="hotel-shell hotel-branded">
      <HotelBrandHeader />
      <header className="hotel-header">
        <div>
          <span className="eyebrow">VASHISHT TRAVELOS</span>
          <h1>Hotel owner workspace</h1>
          <p>Register your property and prepare its room catalogue.</p>
        </div>
      </header>
      {!data.emailVerified && (
        <section className="verification-card" aria-labelledby="verify-title">
          <ShieldCheck size={22} />
          <div>
            <h2 id="verify-title">Start your hotel registration</h2>
            <p>
              Save your property and room categories as a private draft. Verify
              your email before submitting for approval or accepting bookings.
            </p>
            {data.verificationEmailAvailable ? (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  setNotice("");
                  try {
                    const result = await authClient.sendVerificationEmail({
                      email,
                      callbackURL: "/hotelier",
                    });
                    if (result.error)
                      throw Error(
                        result.error.message ||
                          "Could not send verification email",
                      );
                    setNotice(
                      "Verification email requested. Check your inbox and spam folder, then reload this page after verifying.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send verification email
              </button>
            ) : (
              <p>
                Email delivery is awaiting platform setup. You can save your
                private draft now; contact support to complete verification.
              </p>
            )}
          </div>
        </section>
      )}
      <HotelWelcomeImage />
      <div className="hotel-stage-note">
        <ShieldCheck size={18} />
        <span>
          {data.inventoryEnabled
            ? "Date-wise inventory, verified ad pages and temporary room holds are available. Hotel-specific checkout requires an authorized merchant; test payments are not real bookings."
            : "Foundation stage: registration, verification and room categories. Inventory and booking are not enabled."}
        </span>
      </div>
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
      <div className="hotel-layout">
        <aside className="hotel-properties">
          <h2>Your properties</h2>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => {
              setCreating(true);
              setTab("Profile");
              setError("");
              setNotice("");
            }}
          >
            <Plus size={16} />
            Register hotel
          </button>
          {data.hotels.map((h) => (
            <button
              key={h.id}
              className={
                selected === h.id && !creating
                  ? "hotel-property selected"
                  : "hotel-property"
              }
              onClick={() => {
                setSelected(h.id);
                setCreating(false);
                setTab("Profile");
                setRoomId("");
                setError("");
              }}
            >
              <Building2 size={18} />
              <span>
                <strong>{h.name}</strong>
                <small>
                  {h.city || "Draft address"} · {h.status}
                </small>
              </span>
            </button>
          ))}
          <p className="method-note">
            Access comes from hotel membership, independently of agency roles.
          </p>
        </aside>
        <section className="hotel-content">
          <div className="hotel-section-header">
            <div>
              <h2>
                {creating
                  ? "Register a hotel"
                  : hotel?.name || "Select a property"}
              </h2>
              {!creating && hotel && (
                <p>
                  Verification: <strong>{hotel.status}</strong> · Revision{" "}
                  {hotel.revision} · {hotel.role}
                </p>
              )}
            </div>
            {!creating &&
              hotel &&
              hotel.role === "OWNER" &&
              ["DRAFT", "REJECTED"].includes(hotel.status) && (
                <button
                  className="btn primary"
                  disabled={busy || !data.emailVerified}
                  title={
                    !data.emailVerified
                      ? "Verify your email to submit your property"
                      : undefined
                  }
                  onClick={() =>
                    act({
                      action: "submit",
                      hotelId: hotel.id,
                      revision: hotel.revision,
                    })
                  }
                >
                  Submit for verification
                </button>
              )}
          </div>
          {!creating && hotel?.reviewReason && (
            <p className="info-box">Review note: {hotel.reviewReason}</p>
          )}
          {!creating && hotel && (
            <nav className="hotel-tabs" aria-label="Hotel sections">
              {["Profile", "Room categories", "Audit history"].map((t) => (
                <button
                  key={t}
                  aria-current={tab === t ? "page" : undefined}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
          )}
          {(creating || tab === "Profile") && (
            <ProfileForm
              key={creating ? "new" : hotel?.id + "-" + hotel?.revision}
              hotel={creating ? undefined : hotel}
              email={email}
              disabled={busy || !editable}
              onSave={(profile) =>
                act(
                  creating
                    ? { action: "create", profile }
                    : {
                        action: "profile",
                        hotelId: hotel!.id,
                        revision: hotel!.revision,
                        profile,
                      },
                )
              }
            />
          )}
          {!creating && hotel && tab === "Room categories" && (
            <>
              <p className="method-note">
                Declared room count is not date-wise availability. No rooms can
                be booked at this stage.
              </p>
              <div className="hotel-room-grid">
                {hotel.rooms.map((r) => (
                  <article key={r.id}>
                    <h3>{r.name}</h3>
                    <p>
                      {r.totalRooms} declared rooms · up to {r.maxOccupancy}{" "}
                      guests
                    </p>
                    <p>{r.active ? "Active" : "Inactive"}</p>
                    <button
                      className="text-button"
                      onClick={() => setRoomId(r.id)}
                    >
                      Edit {r.name}
                    </button>
                  </article>
                ))}
              </div>
              <button className="btn secondary" onClick={() => setRoomId("")}>
                New room category
              </button>
              <RoomForm
                key={hotel.id + roomId + hotel.revision}
                room={hotel.rooms.find((r) => r.id === roomId)}
                disabled={busy || !editable}
                onSave={(room) =>
                  act({
                    action: "room",
                    hotelId: hotel.id,
                    revision: hotel.revision,
                    ...(roomId ? { roomId } : {}),
                    room,
                  })
                }
              />
            </>
          )}
          {!creating && hotel && tab === "Audit history" && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Revision</th>
                    <th>Recorded at</th>
                  </tr>
                </thead>
                <tbody>
                  {hotel.audit.map((a) => (
                    <tr key={a.id}>
                      <td>{a.action}</td>
                      <td>{a.revision}</td>
                      <td>
                        {new Date(a.createdAt).toLocaleString("en-IN", {
                          timeZone: hotel.timezone,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="method-note">
                Latest 20 events. Owner responses do not include other users'
                identities.
              </p>
            </div>
          )}
        </section>
      </div>
      {data.emailVerified && data.inventoryEnabled && hotel && !creating && (
        <HotelBookingConsole
          key={hotel.id}
          hotelId={hotel.id}
          rooms={hotel.rooms}
          status={hotel.status}
          role={hotel.role}
        />
      )}
    </main>
  );
}
function ProfileForm({
  hotel,
  email,
  disabled,
  onSave,
}: {
  hotel?: Property;
  email: string;
  disabled: boolean;
  onSave: (profile: unknown) => void;
}) {
  const p = hotel || { ...emptyProfile, contactEmail: email };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const profile: Record<string, unknown> = {};
        for (const key of [
          "name",
          "address",
          "city",
          "region",
          "countryCode",
          "postalCode",
          "timezone",
          "contactEmail",
          "contactPhone",
          "policies",
          "cancellationPolicy",
        ])
          profile[key] = String(f.get(key) || "");
        profile.amenities = list(f.get("amenities"));
        profile.photoUrls = list(f.get("photoUrls"));
        profile.taxBps = Math.round(Number(f.get("taxPercent")) * 100);
        onSave(profile);
      }}
    >
      <fieldset disabled={disabled}>
        <legend className="sr-only">Hotel profile</legend>
        <div className="hotel-form-grid">
          {(
            [
              ["name", "Hotel name"],
              ["city", "City / destination"],
              ["region", "State / region"],
              ["countryCode", "Country code (2 letters)"],
              ["postalCode", "Postal code"],
              ["timezone", "Hotel timezone"],
              ["contactEmail", "Hotel contact email"],
              ["contactPhone", "Hotel international phone"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                defaultValue={p[key]}
                required
                maxLength={key === "countryCode" ? 2 : 254}
                type={key === "contactEmail" ? "email" : "text"}
              />
            </label>
          ))}
          <label className="span-2">
            Full address
            <textarea
              name="address"
              defaultValue={p.address}
              maxLength={500}
              required
            />
          </label>
          <label>
            Tax percentage
            <input
              name="taxPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={p.taxBps / 100}
              required
            />
            <small>
              Explicit hotel configuration; platform review must validate the
              applicable tax.
            </small>
          </label>
          <label>
            Amenities (one per line)
            <textarea
              name="amenities"
              defaultValue={p.amenities.join("\n")}
              maxLength={2500}
            />
          </label>
          <label className="span-2">
            Approved photo URLs (one per line)
            <textarea
              name="photoUrls"
              defaultValue={p.photoUrls.join("\n")}
              maxLength={24000}
            />
            <small>
              Only administrator-approved HTTPS media hosts. Uploads and media
              moderation are a later stage.
            </small>
          </label>
          <label>
            Hotel policies
            <textarea
              name="policies"
              defaultValue={p.policies}
              maxLength={6000}
            />
          </label>
          <label>
            Cancellation policy
            <textarea
              name="cancellationPolicy"
              defaultValue={p.cancellationPolicy}
              maxLength={6000}
            />
          </label>
        </div>
        <p className="method-note">
          Saving profile or room changes returns this property to DRAFT and
          requires a fresh review.
        </p>
        <button className="btn primary">
          {hotel ? "Save hotel profile" : "Create hotel draft"}
        </button>
      </fieldset>
    </form>
  );
}
function RoomForm({
  room,
  disabled,
  onSave,
}: {
  room?: Property["rooms"][number];
  disabled: boolean;
  onSave: (room: unknown) => void;
}) {
  return (
    <form
      className="hotel-room-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          name: String(f.get("name")),
          description: String(f.get("description") || ""),
          totalRooms: Number(f.get("totalRooms")),
          maxAdults: Number(f.get("maxAdults")),
          maxChildren: Number(f.get("maxChildren")),
          maxOccupancy: Number(f.get("maxOccupancy")),
          amenities: list(f.get("amenities")),
          active: f.get("active") === "on",
        });
      }}
    >
      <h3>{room ? "Edit room category" : "Add room category"}</h3>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Room category</legend>
        <div className="hotel-form-grid">
          <label>
            Room category name
            <input
              name="name"
              defaultValue={room?.name || ""}
              required
              maxLength={100}
            />
          </label>
          {(
            [
              ["totalRooms", "Declared room count", 1, 10000, 1],
              ["maxAdults", "Maximum adults", 1, 20, 2],
              ["maxChildren", "Maximum children", 0, 20, 0],
              ["maxOccupancy", "Maximum combined guests", 1, 20, 2],
            ] as const
          ).map(([key, label, min, max, fallback]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                type="number"
                min={min}
                max={max}
                defaultValue={room?.[key] ?? fallback}
                required
              />
            </label>
          ))}
          <label>
            Room amenities (one per line)
            <textarea
              name="amenities"
              defaultValue={room?.amenities.join("\n") || ""}
              maxLength={2500}
            />
          </label>
          <label className="span-2">
            Room description
            <textarea
              name="description"
              defaultValue={room?.description || ""}
              maxLength={3000}
            />
          </label>
          <label className="hotel-check">
            <input
              type="checkbox"
              name="active"
              defaultChecked={room?.active ?? true}
            />
            Category active
          </label>
        </div>
        <button className="btn primary">Save room category</button>
      </fieldset>
    </form>
  );
}
