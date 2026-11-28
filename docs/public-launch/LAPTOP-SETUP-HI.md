# Laptop se TravelOS launch setup — 28 November 2026

Edge/Chrome browser se yeh setup ho sakta hai; abhi terminal ki zaroorat nahi. Password, OTP, authenticator key, recovery codes, bank details aur API secrets chat mein na bhejein.

## Pehle confirm karein ki naya release live hai

1. Cloudflare Dashboard → Workers & Pages → `vashisht-travelos-api-staging` → Builds/Deployments mein latest **main commit** aur Success dekhein. Backend deploy command `npm run cloudflare:release:worker` hi rehna chahiye: yeh restore bookmark check aur outstanding D1 migrations ke baad Worker deploy karta hai.
2. Pages project `travel-booking` ka latest main build bhi Success hona chahiye; output `cloudflare/pages-dist`. Sirf GitHub checks green hona live Cloudflare deployment proof nahi hai.
3. `https://travel-booking-dnn.pages.dev/api/health/live` kholein. Naye code mein `status: up` ke saath `release` ID milegi. Is ID ko deployed backend commit se match karein. Agar sirf purana `{status:up}` mile, purana backend abhi serve ho raha hai. Production database ko reset/delete ya demo seed na karein.
4. Website Ctrl+Shift+R se refresh karein. Product/Features/Solutions/Pricing buttons ab information popup kholte hain. Popup ka detailed-page button alag screen kholta hai. Dark preference public pages, login aur workspaces par shared hai; printable documents paper-friendly rehte hain.

## Aapka platform administrator

Owner identity: **avinav.vashisht@gmail.com**. Yeh additional owner entry hai; existing configured administrators replace nahi hote. Account ko automatically verified ya MFA-enabled nahi kiya gaya.

1. Isi owned email se sign in karein: `https://travel-booking-dnn.pages.dev/login?next=admin`.
2. Setup screen: `https://travel-booking-dnn.pages.dev/admin/setup`. Ismein sirf aapke identity/setup checks hain; verification se pehle client business data nahi milega.
3. Email verification complete hone par Microsoft Authenticator/Google Authenticator mein time-based account enrol karein. Site par dikhne wali private setup key aur recovery codes apne paas securely save karein. Current code type karke setup confirm karein.
4. `https://travel-booking-dnn.pages.dev/admin` par fresh MFA verification complete karein. Yahan real agency/access/trial/hotel-record counts, configuration gaps, manual subscription review aur hotel/marketplace administration links hain. Proposed prices ko MRR/ARR nahi maana jata; verified billing ke bina revenue unavailable rehta hai.

## Email verification aur password reset — required

Cloudflare Worker code Resend ka HTTP provider use karta hai; laptop SMTP password Worker ke liye sufficient nahi hai.

1. Resend par account banayein aur authorised sender/domain verify karein. Client emails ke liye aapke owned sending domain ki zaroorat pad sakti hai; `pages.dev` subdomain aapka email sending domain nahi hai. Provider's test-sender restrictions aur fees check karein.
2. Cloudflare → backend Worker → Settings → Variables and Secrets: `RESEND_API_KEY` secret aur approved `MAIL_FROM` set karein. Keys Pages frontend mein na daalein.
3. Apne test account se verification/resend aur forgot-password test karein: inbox, correct HTTPS link, expiry aur one-use behavior verify karein.
4. Working delivery prove hone ke baad repository Worker config mein `REQUIRE_EMAIL_VERIFICATION="true"` ka reviewed release chahiye. Dashboard-only override agle Git release mein replace ho sakta hai. Bina delivery prove kiye verification enforce karne se users lock out ho sakte hain. SQL se account ko verified mark karke bypass na karein.

## Live AI — provider account aur bounded pilot

OpenAI API platform par separate project/API billing aur spending budget chahiye; ChatGPT subscription API credits nahi deti. `AI_API_KEY` backend secret hai. Provider/model compatibility aur one-agency pilot test karna hoga. Existing guided assistant records/drafts ke saath kaam karta hai; optional live routing ko paid approval, `PAID_AI_ENABLED`, `WORKSPACE_ASSISTANT_LIVE_APPROVED` aur `WORKSPACE_ASSISTANT_LIVE_AGENCY_IDS` ki reviewed configuration chahiye. Flags sirf key paste karne se automatically enable nahi hote. Final booking, payment/refund aur outbound actions backend proof/approval boundaries follow karenge.

Cloudflare AI Gateway routing/observability layer ho sakta hai; yeh model credentials, token credits ya telephony ko free nahi banata. Is release mein koi paid AI service activate nahi hui.

## SaaS payments — pehle Razorpay Test Mode

Razorpay merchant account/KYC aur Test Mode ready karein. Current SaaS subscription code **test-only** hai aur live keys reject karta hai. Secrets `SAAS_TEST_RAZORPAY_KEY_ID`, `SAAS_TEST_RAZORPAY_KEY_SECRET`, `SAAS_TEST_RAZORPAY_WEBHOOK_SECRET` backend par rakhe jayenge; explicit catalogue/terms/pilot allowlist bhi required hai. Signed test webhook: `/api/billing/sandbox/webhook`.

Actual Test Mode payloads, checkout, duplicate/late events, recurring periods aur refunds verify karne honge. Live entitlements/renewal/tax invoices ke liye further reviewed implementation/activation chahiye. Key dalna live subscription launch ke barabar nahi. Platform SaaS revenue aur agency customer-booking payments separate rahenge; default commission deduction/split nahi chalega.

Naye monthly proposals: **₹2,499 / ₹4,999 / ₹8,999 / ₹14,999 + applicable GST**. Existing clients automatically reprice nahi hote. Annual terms, refund/cancellation and real usage allowances written agreement mein final karein.

## WhatsApp aur ads

Public contact button ab **+91 97179 56828** par click-to-chat kholta hai. Message aap/visitor review karke bhejta hai; koi automatic send nahi hota.

Clients ki official WhatsApp automation ke liye Meta business/app approval, authorised WABA/number, per-agency credentials, approved templates aur customer opt-in chahiye. Meta/Google ads ko connect karne ke liye respective apps/OAuth permissions aur remaining native D1 integration work chahiye. Provider accounts/keys alone unfinished D1 code ko complete nahi karte. Existing draft/record workflows ko live template/media marketing na samjhein.

## Voice, GST invoices aur full customer portal

Voice ke liye telephony provider, inbound number, speech/model service, usage budget, consent/recording policy aur reliable human handoff chahiye. Full voice-call module abhi implemented/enabled nahi hai; browser demo ko real inbound AI call agent nahi kaha ja raha.

GST invoices ke liye legal business name, GSTIN (if applicable), registered address, place-of-supply/rate rules, invoice numbering/financial-year and refund/credit-note policy ready rakhein; applicable rules apne accountant se validate karein. Current printable quotation/booking documents statutory GST invoice engine nahi hain. Full customer login portal, signed online acceptance, compliant invoice engine aur live voice abhi remaining implementation hain.

## Automation rollout

Maintained package → consented customer requirements → scoped enquiry → reviewed backend-priced quotation → validated inventory hold → backend-verified payment → required supplier approval → confirmation → consented reminders → reconciled reports. Har step ka provider access, failure recovery aur approval boundary test hoga. AI ka “done” kehna payment/inventory proof nahi hai. Is guide ya UI release se sab phases automatically complete nahi hue.
