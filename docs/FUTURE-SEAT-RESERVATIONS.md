# Seat-level reservation gate

Live seat ticketing is disabled. Only complete-vehicle charters are implemented. The future adapter contract is `src/lib/marketplace/seat-contract.ts`; it does not connect to any supplier or generate inventory.

Before implementation/activation: contracted operator API access, trip-specific seat maps, authoritative source revisions and freshness deadlines, atomic external reservation acknowledgements, seat/trip uniqueness constraints, webhook signature authentication and replay deduplication, missed-event reconciliation, tested source outages, release/expiry semantics, backend payment verification, refund policy and explicit launch approval. A cached seat map is never booking authority. Never invent seat prices/availability or turn the charter inventory into seat inventory.
