# TravelOS shared UI

The existing Render application uses the screen-only theme in `src/app/premium.css`, loaded after base styles. The same repository, authentication, tenant permissions, database and business actions remain in use. No migration is needed. Print styles remain independent.

| Feature | UI coverage |
| --- | --- |
| Overview | Summary cards, enquiry board, filters and charts |
| Analytics and BI | Filter rails, metric cards, report controls and exports |
| Enquiries | Search toolbar, list/board toggle, message entry and customer details |
| Packages | Package cards, destination covers, prices and actions |
| Quotations | Record table, status labels, row actions and quotation dialogs |
| Bookings | Balance summaries, booking register and entry/status dialogs |
| Transactions | Payment/expense tables and record forms |
| Marketing | Spend summaries, source analysis and expense forms |
| Monthly report | Report header, metric summaries, tables and observations |
| Lead intelligence | Model information, inputs and explanations |
| Messaging | Consent form, section headers, templates and delivery tables |
| Automation | Policy control cards and execution history |
| Integrations | Provider cards, connection controls and sync tables |
| Subscription | Usage summary, plan cards, current-plan state and request form |
| Settings and security | Agency profile, onboarding checklist, team records and security forms |
| Demo guide | Guided steps and explanatory cards |
| Public/auth pages | Shared typography, marketing cards, navigation and login/signup forms |

No new provider connectivity, automatic billing, live customer messages or AI capabilities are implied by the visual redesign. Existing disabled states remain disabled.

Verification uses the production build, the existing browser regression suite, screenshots of all 17 workspace sections and 9 public/auth routes at desktop/mobile sizes, and a customer-details/list/pipeline smoke check. Screenshot data is fictional. Local review artifacts are stored under ignored `.local/design/all-features-preview/`.
