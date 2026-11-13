# Hotel API contracts

All implemented routes are feature-gated, private/no-store, authenticated and rate-limited. Mutations require same-origin JSON. Unknown body properties fail validation. User/hotel ownership is derived server-side, never accepted as a permission in the body. Operators additionally need the existing verified allowlist and fresh MFA session proof.

## Foundation contracts (implementation stage 1)

- GET `/api/hotelier`: verified user’s hotels and own membership roles; never lists other hotels.
- POST `/api/hotelier`: `{ action: "create", profile }` creates a DRAFT and OWNER membership atomically. Registration is not approval.
- POST `/api/hotelier`: `{ action: "profile", hotelId, revision, profile }` updates owned property, increments revision and resets publication status to DRAFT. Suspended hotels cannot be edited by the owner.
- POST `/api/hotelier`: `{ action: "room", hotelId, revision, roomId?, room }` creates/updates a room category belonging to the same hotel; room count is declared capacity, not live availability.
- POST `/api/hotelier`: `{ action: "submit", hotelId, revision }` validates minimum profile/policy/room data and moves DRAFT or REJECTED → PENDING.
- GET `/api/admin/hotels`: recent properties for authorized platform review.
- POST `/api/admin/hotels`: `{ hotelId, revision, decision: "APPROVED" | "REJECTED" | "SUSPENDED", reason }`. Approval/rejection requires PENDING; suspension requires APPROVED. Review must reflect real off-platform business checks; UI status is not documentary verification.

Profile fields: name, address, city, region, countryCode, postalCode, timezone, contactEmail, contactPhone, amenities[], photoUrls[], policies, cancellationPolicy, taxBps. Taxes are configured explicitly, not inferred. Photo URLs require HOTEL_IMAGE_HOSTS allowlisting and HTTPS, and no backend fetching is performed.

Room fields: name, description, totalRooms, maxAdults, maxChildren, maxOccupancy, amenities[], active. Only declared category/capacity is supported at this stage. APIs intentionally expose no purchase, quote, payment or booking-confirmation endpoint yet.

Error contract: `{ error }`; 400 invalid input, 401 no login, 403 disabled/unverified/unauthorized, 404 unknown or inaccessible property/category, 409 stale revision/state conflict, 429 rate limit, 503 feature/config/database unavailable. No raw Prisma/provider exceptions or secret-bearing input is returned.

## Proposed later contracts — not implemented in this stage

- GET `/api/hotels/search?destination&checkIn&checkOut&adults&children&rooms&budget&amenities&page` → approved matches with backend-derived price/currency/tax/date breakdown and availability timestamp. Child ages/occupancy policy must be resolved before an authoritative quote.
- POST `/api/hotels/quotes` → immutable, short-lived quote with nightly/policy/tax snapshots, referral attribution and server signature/ID.
- POST `/api/hotels/holds` → idempotency key + quoteId + explicit contact/privacy consent; returns expiring hold only after atomic inventory validation. This is not a confirmed booking.
- POST `/api/hotels/payments/order` → holdId, authorized hotel merchant; server-calculated amount and provider order ID. Disabled until merchant model approved.
- POST `/api/hotels/payments/webhook` → raw bytes/HMAC; account/order/event reconciliation and durable idempotency; retry-safe acknowledgement.
- POST `/api/hotels/reservations/:id/cancel` → authenticated customer ownership or authorized hotel operator, cancellation calculation and refund workflow with no optimistic provider success.
- POST `/api/hotels/chat` → conversation consent + message; constrained extraction/search tools, no arbitrary action names, model/tool usage and handoff status.

A client-supplied agency/campaign/referral identifier is attribution input only. Attribution never grants hotel access, changes merchant routing or alters trusted prices.
