"use client";
import { useState, useEffect } from "react";
import type { publicHotel, hotelQuote } from "@/lib/hotels/booking";
import { readApiJson } from "@/lib/api-response";
import { inr } from "@/lib/money";
type Hotel = Awaited<ReturnType<typeof publicHotel>>;
type Quote = Awaited<ReturnType<typeof hotelQuote>>;
export default function HotelStayAgent({ hotel }: { hotel: Hotel }) {
  const [now, setNow] = useState(Date.now());
  const [guideMode, setGuideMode] = useState("Hotel guide");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const [stay, setStay] = useState({
      roomId: hotel.rooms[0]?.id || "",
      checkIn: "",
      checkOut: "",
      rooms: 1,
      adults: 2,
      children: 0,
    }),
    [quote, setQuote] = useState<Quote | null>(null),
    [messages, setMessages] = useState<{ role: string; content: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [saveChat, setSaveChat] = useState(false),
    [aiConsent, setAiConsent] = useState(false),
    [saved, setSaved] = useState<{
      id: string;
      status: string;
      holdUntil: string;
      total: number;
      confirmed?: boolean;
      checkoutAvailable?: boolean;
      paymentMode?: string | null;
      paymentStatus?: string;
      checkIn?: string;
      checkOut?: string;
      rooms?: number;
    } | null>(null);
  const endpoint = "/api/public/hotels/" + hotel.id;
  useEffect(() => {
    void fetch(endpoint + "?action=status", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) setSaved(await r.json());
      })
      .catch(() => {});
  }, [endpoint]);
  useEffect(() => {
    void fetch(endpoint + "?action=chat", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) {
          const body = await r.json();
          setMessages(body.messages);
          if (body.stay) setStay(body.stay);
        }
      })
      .catch(() => {});
  }, [endpoint]);
  async function action<T>(action: string, input: unknown) {
    return readApiJson<T>(
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input }),
      }),
    );
  }
  return (
    <div className="hotel-booking-grid">
      <section className="panel">
        <h2>Find your room</h2>
        <p>
          Choose dates to check actual hotel-managed availability and the final
          price.
        </p>
        <form
          className="hotel-inventory-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              setQuote(await action<Quote>("quote", stay));
            } catch (e) {
              setQuote(null);
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Room category
            <select
              value={stay.roomId}
              onChange={(e) => {
                setStay({ ...stay, roomId: e.target.value });
                setQuote(null);
              }}
            >
              {hotel.rooms.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {(["checkIn", "checkOut"] as const).map((name) => (
            <label key={name}>
              {name === "checkIn" ? "Check-in" : "Check-out"}
              <input
                type="date"
                value={stay[name]}
                required
                onChange={(e) => {
                  setStay({ ...stay, [name]: e.target.value });
                  setQuote(null);
                }}
              />
            </label>
          ))}
          {(["rooms", "adults", "children"] as const).map((name) => (
            <label key={name}>
              {name}
              <input
                type="number"
                value={stay[name]}
                min={name === "children" ? 0 : 1}
                max={name === "rooms" ? 10 : 100}
                required
                onChange={(e) => {
                  setStay({ ...stay, [name]: Number(e.target.value) });
                  setQuote(null);
                }}
              />
            </label>
          ))}
          <button
            className="btn primary"
            disabled={busy || !hotel.rooms.length}
          >
            Check availability and price
          </button>
        </form>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {quote && (
          <section className="hotel-verified-quote">
            <h3>Verified room quotation</h3>
            <p>
              {quote.roomName} · {quote.nights} nights · {quote.rooms} rooms
            </p>
            <p>
              Stay: {inr(quote.subtotal)}
              <br />
              Taxes: {inr(quote.tax)}
              <br />
              <strong>Total: {inr(quote.total)}</strong>
            </p>
            <p>
              Inventory is checked again when you request a hold. This quote
              alone reserves nothing.
            </p>
            <details>
              <summary>Hotel and cancellation policies</summary>
              <p>{quote.policies}</p>
              <p>{quote.cancellationPolicy}</p>
            </details>
            <form
              className="hotel-inventory-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  const params = new URLSearchParams(location.search);
                  const result = await action<{
                    id: string;
                    status: string;
                    holdUntil: string;
                    total: number;
                  }>("hold", {
                    stay,
                    quoteToken: quote.quoteToken,
                    requestId: crypto.randomUUID(),
                    customer: f.get("customer"),
                    phone: f.get("phone"),
                    email: f.get("email") || "",
                    consent: f.get("consent") === "on",
                    confirmed: f.get("confirmed") === "on",
                    attribution: {
                      source: (params.get("utm_source") || "direct").slice(
                        0,
                        80,
                      ),
                      campaign: (params.get("utm_campaign") || "").slice(
                        0,
                        120,
                      ),
                      ref: (params.get("ref") || "").slice(0, 100),
                    },
                  });
                  setSaved(result);
                  setQuote(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Your name
                <input name="customer" minLength={2} maxLength={100} required />
              </label>
              <label>
                Phone with country code
                <input
                  name="phone"
                  type="tel"
                  required
                  placeholder="+919876543210"
                  pattern="\+[1-9][0-9]{7,14}"
                />
              </label>
              <label>
                Email (optional)
                <input name="email" type="email" />
              </label>
              <label>
                <input name="consent" type="checkbox" required /> I agree to
                share my details with this hotel for this stay request.
              </label>
              <label>
                <input name="confirmed" type="checkbox" required /> I reviewed
                the dates, total and published policies. Create a 15-minute room
                hold.
              </label>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  (saved?.status === "HELD" &&
                    saved.holdUntil > new Date(now).toISOString())
                }
              >
                Request temporary room hold
              </button>
            </form>
          </section>
        )}
        {saved && (
          <section role="status" className="hotel-verified-quote">
            <h3>
              {saved.confirmed
                ? "Booking confirmed"
                : saved.status === "SANDBOX_COMPLETED"
                  ? "Sandbox checkout completed"
                  : "Room request saved"}
            </h3>
            <p>
              Reference: {saved.id}
              <br />
              {saved.checkIn && (
                <>
                  {saved.checkIn} → {saved.checkOut} · {saved.rooms} rooms
                  <br />
                </>
              )}
              Total: {inr(saved.total)}
              <br />
              Status:{" "}
              {saved.status === "HELD" &&
              saved.holdUntil < new Date(now).toISOString()
                ? "EXPIRED"
                : saved.status}
              <br />
              Hold expires: {new Date(saved.holdUntil).toLocaleString("en-IN")}
            </p>
            <button
              className="btn secondary"
              disabled={
                busy ||
                saved.status !== "HELD" ||
                saved.paymentStatus === "PENDING"
              }
              onClick={async () => {
                setBusy(true);
                try {
                  setSaved(
                    await action<typeof saved>("cancel", { confirmed: true }),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Release my temporary hold
            </button>
            {saved.confirmed ? (
              <strong>
                Captured payment and reserved inventory verified. Your hotel
                booking is confirmed. Keep this reference and contact the hotel
                for arrival assistance.
              </strong>
            ) : saved.status === "SANDBOX_COMPLETED" ? (
              <strong>
                This was a Razorpay TEST transaction. No real payment or
                confirmed hotel booking was created.
              </strong>
            ) : (
              <strong>
                This is not a confirmed booking. An expired hold does not
                reserve a room.{" "}
                {saved.checkoutAvailable
                  ? "Use secure checkout before the hold expires; confirmation requires backend-verified captured payment."
                  : "This hotel has not enabled checkout. Contact the hotel to arrange your stay."}
              </strong>
            )}
            {saved.checkoutAvailable && saved.status === "HELD" && (
              <button
                className="btn primary"
                disabled={
                  busy || saved.holdUntil <= new Date(now).toISOString()
                }
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const order = await action<{
                      orderId: string;
                      amount: number;
                      currency: string;
                      keyId: string;
                      mode: string;
                    }>("order", { confirmed: true });
                    setSaved({ ...saved, paymentStatus: "PENDING" });
                    const win = window as typeof window & {
                      Razorpay?: new (options: Record<string, unknown>) => {
                        open(): void;
                      };
                    };
                    if (!win.Razorpay)
                      await new Promise<void>((resolve, reject) => {
                        const script = document.createElement("script");
                        script.src =
                          "https://checkout.razorpay.com/v1/checkout.js";
                        script.onload = () => resolve();
                        script.onerror = () =>
                          reject(
                            Error(
                              "Secure checkout could not load. Your room request is still saved.",
                            ),
                          );
                        document.head.append(script);
                      });
                    if (!win.Razorpay)
                      throw Error("Secure checkout is unavailable");
                    new win.Razorpay({
                      key: order.keyId,
                      order_id: order.orderId,
                      amount: order.amount,
                      currency: order.currency,
                      name: hotel.name,
                      description:
                        order.mode === "test"
                          ? "TEST hotel checkout — no real booking"
                          : "Hotel room reservation",
                      modal: { ondismiss: () => setBusy(false) },
                      handler: async (result: {
                        razorpay_order_id: string;
                        razorpay_payment_id: string;
                        razorpay_signature: string;
                      }) => {
                        try {
                          setSaved(
                            await action<typeof saved>("verify", {
                              orderId: result.razorpay_order_id,
                              paymentId: result.razorpay_payment_id,
                              signature: result.razorpay_signature,
                            }),
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      },
                    }).open();
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                {saved.paymentMode === "test"
                  ? "Open Razorpay TEST checkout"
                  : "Proceed to secure checkout"}
              </button>
            )}
          </section>
        )}
      </section>
      <section className="panel">
        <h2>Ask about your stay</h2>
        <p role="status">{guideMode}</p>
        <p>
          Hindi, English or Hinglish. Hotel facts, policies and prices come from
          verified backend records. The guide cannot collect payment or confirm
          a booking.
        </p>
        <div aria-live="polite">
          {messages.map((m, i) => (
            <p className="hotel-chat-message" key={i}>
              <small>{m.role === "user" ? "You" : "Hotel guide"}</small>
              {m.content}
            </p>
          ))}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await action<{
                messages: typeof messages;
                quote: Quote | null;
                mode: string;
              }>("chat", {
                message: text,
                storageConsent: saveChat,
                aiConsent,
                ...(stay.checkIn && stay.checkOut ? { stay } : {}),
              });
              setMessages(result.messages);
              setGuideMode(result.mode);
              if (result.quote) setQuote(result.quote);
              setText("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="hotel-inventory-form"
        >
          <label>
            <input
              type="checkbox"
              checked={saveChat}
              onChange={(e) => setSaveChat(e.target.checked)}
            />{" "}
            Save my chat for 7 days for the hotel team. Do not enter card
            details.
          </label>
          <label>
            <input
              type="checkbox"
              checked={aiConsent}
              onChange={(e) => setAiConsent(e.target.checked)}
            />{" "}
            Allow AI processing of my minimized trip conversation when
            configured.
          </label>
          <label>
            Your message
            <textarea
              maxLength={500}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Is breakfast included? / Cancellation policy kya hai?"
            />
          </label>
          <button className="btn secondary" disabled={busy || !saveChat}>
            Send to hotel guide
          </button>
        </form>
        <p>
          Without AI configuration or consent, the saved hotel guide uses
          published facts and can flag a human handoff. No staff response time
          is guaranteed.
        </p>
      </section>
    </div>
  );
}
