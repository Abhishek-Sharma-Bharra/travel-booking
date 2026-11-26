# Paid launch setup — aapke liye steps

Status: 23 November 2026. Keys, passwords, bank details aur customer data chat mein na bhejein. ChatGPT subscription aur OpenAI API billing alag products hain.

## 1. Live AI ka setup

1. https://platform.openai.com/ par API project banayein. Available model aur approved test budget decide karein; billing/project access configure karein. Spending alerts ko guaranteed hard cap na samjhein; application quotas bhi rahenge.
2. Project API key banayein. Cloudflare dashboard → Workers & Pages → `vashisht-travelos-api-staging` → Settings → Variables and Secrets → Add → **Secret** mein `AI_API_KEY` save karein. `NEXT_PUBLIC_` naam ya frontend bundle mein key na rakhein. Encrypted dikhna normal hai.
3. `AI_MODEL` existing router ke supported model par set hota hai; default `gpt-4.1-mini` hai. Account/model compatibility abhi real provider se verify nahi hui.
4. Key save karne bhar se live usage on nahi hota. Abhi `PAID_AI_ENABLED=false` aur `WORKSPACE_ASSISTANT_LIVE_APPROVED=false` rehne dein. Global paid flag purane campaign/extraction modules ko bhi affect karta hai; bina staged pilot review ke ise on na karein.
5. Approved test budget, one pilot agency, privacy and failure tests ke baad us agency ID ko server-managed `WORKSPACE_ASSISTANT_LIVE_AGENCY_IDS` allowlist mein add karke controlled live routing enable karein. Provider response/usage/invoice reconcile karein. Yeh enable step abhi execute nahi hua hai.

Live workspace provider abhi bounded intent routing karta hai; CRM facts/prices server tools nikaalte hain. General-purpose multi-turn LLM memory aur har business ka autonomous agent isse automatic nahi ban jata. Hotel/bus/car operations assistant ka naya version guided, read-only aur provider-free hai.

## 2. SaaS subscription billing

1. https://dashboard.razorpay.com/ par **Vashisht Analytics/platform business** ka merchant account banayein aur Test Mode access taiyar karein. Hotel ke booking merchant ko platform subscription collection ke liye reuse na karein.
2. Monthly/annual plan prices, taxes included/extra, trial, renewal date, cancellation/refund rules aur invoices ke commercial details final karein. Proposed rates ko customer contract samajhkar silently charge nahi kiya jayega.
3. Test API key/secret ko secure environment configuration mein rakhein; chat ya frontend mein nahi. Recurring subscriptions ki provider eligibility/activation verify karein.
4. SaaS-specific checkout/order/subscription records, backend verified webhooks, event replay protection, failed/late/duplicate payment cases, reconciliation aur billing history implement/test karne hain. **Yeh SaaS financial flow abhi complete nahi hai.** Maujooda hotel payment webhook iske liye use na karein. Sahi SaaS webhook endpoint us implementation ke saath diya jayega.
5. Test approval ke baad live keys aur explicit live activation. Browser ka “payment successful” redirect akela paid plan activate nahi karega. Filhaal existing subscription requests/admin review manual hain.

## 3. Meta/Google Ads

1. Meta Developer App banayein: https://developers.facebook.com/apps/ . Purpose clients ko unke ad spend ka read-only access dena hai. Marketing API/ads read use case, business/app review aur required advanced access process complete karein; permissions app dashboard ke current requirements ke mutabik honge.
2. Google Cloud project: https://console.cloud.google.com/ . OAuth consent screen, web OAuth client, Google Ads API aur developer token/access approval taiyar karein.
3. Current code ke callback paths: `https://travel-booking-dnn.pages.dev/api/integrations/meta/callback` aur `/api/integrations/google/callback`. Same primary origin/redirects use karein. Current policy URLs `/privacy` aur `/terms` hain; app-review submission se pehle unki actual content/service details review karein.
4. Server config names: `META_APP_ID`, secret `META_APP_SECRET`, explicitly supported `META_GRAPH_VERSION`; `GOOGLE_CLIENT_ID`, secret `GOOGLE_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` and explicitly supported `GOOGLE_ADS_API_VERSION`. Credential vault also needs existing `INTEGRATION_ACTIVE_KEY` and `INTEGRATION_ENCRYPTION_KEYS` with reviewed rotation/recovery. Har tenant ko apna OAuth consent dena hoga; clients ke ad passwords collect nahi karne.
5. **Current D1 blocker:** live advertising operations call `requirePostgresIntegration` and are deliberately disabled on D1. Keys alone will not connect them. Before enabling, a separate native D1 port must replace PostgreSQL row-lock transactions with tested atomic claims, revision checks, leased/checkpointed sync and tenant-scoped encrypted credentials. Is release ne woh gate nahi hataya. PostgreSQL infrastructure kharidne/activate karne ki zaroorat assume nahi ki gayi.

## 4. Official WhatsApp

1. Meta business/WhatsApp Business Platform account, approved sender number and business setup taiyar karein. Customer opt-in aur required templates review karein.
2. Existing callback is `/api/messaging/webhook`; verification/signature setup uses `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`. Existing provisioning workflow keeps sender access tokens server-side.
3. `WHATSAPP_PROVISION_APPROVED`/`WHATSAPP_LIVE_SEND_APPROVED` off rahenge until sender provisioning, D1 compatibility, webhook signatures, consent/template policy, deduplication, retry/delivery receipts and cost validation pass. Approved apps/sender alone do not establish that these end-to-end tests passed.

## 5. Production testing

Use an isolated test business. Verify signup/login, own-business data, itinerary/quote review, hotel inventory/charters, payment failures/retries and cancellation guards. Agree a small test window and request limit before live load tests; do not stress the public Free-plan deployment. Local concurrency tests detect correctness regressions, not a supported production customer count.

## Is release mein kya complete hua

Hotel aur bus/car owners apne selected month ke aggregate records par summary, revenue, booked occupancy/fleet utilisation aur planning status pooch sakte hain. Wrong-owner/viewer/disabled accounts denied hain. Replies guest contacts nahi dikhate. No reservation, payment, refund, external message, provider spend or subscription activation is performed by this assistant.

Account onboarding ke liye real email delivery bhi test karein: signup verification, resend aur password recovery inbox tak pahunchne chahiye. Hotel operations verified owner accounts par depend karti hain; database mein manually email verified mark karke delivery setup ko bypass na karein.

26 November update: agency subscription ka disabled-by-default native D1 **sandbox** ab implement hua hai. Test checkout, signed/independently verified webhook aur test receipt history ke details `docs/saas-billing-sandbox/README.md` mein hain. Isse production paid access, real charges, statutory invoicing ya supplier subscriptions enable nahi hote. User ne merchant account aur commercial terms abhi ready nahi hone ki confirmation di hai.
