# Conversational assistant upgrade — 23 November 2026

User confirmed the deployed lavender UI and requested a business-readiness summary, remaining automation and a ChatGPT-like owner/customer assistant. Base e21547c.

## Audit

One public site serves separate agency, hotel and transport workspaces. CRM, catalogue/quotes/bookings, operational ledgers, campaign and hotel guest guides, scoped read/draft tools and usage quotas exist. Owner assistant is currently a single-result form. SaaS billing is manual; no automatic subscription collection. Live provider credentials/merchant readiness remain unverified. No count of paying businesses, load capacity or percentage readiness can be inferred from code.

## Implementation sequence

1. Conversational owner interface over existing authenticated tools: bounded in-memory turns, explicit context, quick prompts, fresh-result cards and reviewed workflow handoffs. Clear/new conversation removes local turns and selections; no browser persistence or old transcript sent to the model. Existing guest campaign/hotel chats retain their isolated public scopes.
2. Honest help/unsupported-intent response; avoid mapping every unknown request to package search. Expose capabilities and unavailable automation without pretending actions occurred.
3. Test multi-turn behaviour, context switches, clear-chat privacy, keyboard/mobile, existing handoffs and unknown/retry handling. Keep backend permissions, quotas, financial checks and paid-provider gates.
4. Account-dependent work: secure live AI pilot, approved subscription terms/prices, merchant/test webhooks, reconciliation and invoices, approved messaging identity. These are outstanding production dependencies, not implemented by drawing a chatbot. Do not activate a paid service or live financial execution from this task alone.

No customer table reset, chat persistence migration, credentials in client code, autonomous booking/payment/refund or outbound message is introduced. A tool result remains a dated lookup; past turns are not live inventory or proof of an external action. Existing paid providers remain disabled.
