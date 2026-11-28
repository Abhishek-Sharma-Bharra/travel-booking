# Laptop se agle setup steps

Aapne accounts “not ready” bataye hain. Isliye real payment, outgoing WhatsApp aur ads connection activate nahi kiye gaye. Password, OTP, bank details ya API secret chat mein na bhejein.

## Website mein kahan dekhein

- Home → Product: compact dropdown aur normal-size service headings.
- Agency login → sidebar **Accounts & customer portal**: booking choose karke reviewed GST invoice/credit note banayein, PDF save karein aur customer access revoke karein.
- Usi screen ka **Official WhatsApp delivery** link: approved business connection, customer consent, template preview aur delivery records.
- Workspace → Integrations: Meta/Google read-only spend connection. Abhi approval/configuration flags OFF hain.
- AI assistant → **Enable browser voice input**: supported browser mein microphone permission ke baad bolkar draft banayein; draft review karke submit karein. Inbound phone calls is feature ka hissa nahi hain.

## 1. Email sender ready karein

[Resend](https://resend.com/) par owned business domain/sender verify karein. Cloudflare backend Worker → Settings → Variables and Secrets mein server-only `RESEND_API_KEY` aur approved `MAIL_FROM` configure hoga. Website frontend mein key nahi daalni hai. Pehle ek fictional customer ke email par portal invitation, expiry aur revoke test karein. Sending domain ready na ho to invitation button success claim nahi karega.

## 2. Razorpay account aur commercial terms

[Razorpay Dashboard](https://dashboard.razorpay.com/) par merchant account/KYC aur Test Mode ready karein. Do flows alag hain:

- Aapke platform ki subscription fee: aapka merchant account. Existing subscription sandbox test-only hai; live recurring renewals/entitlements ka code aur approved terms abhi baaki hain.
- Agency ke traveller ki booking payment: us agency ka authorised merchant account. Naya booking-payment flow per-agency merchant verification support karta hai; sab agency payments ko bina contract aapke account mein collect nahi karega.

Tax/refund/cancellation terms aur merchant ownership final karein. Test keys backend secret mein configure karke ek agency ka bounded pilot test hoga. Duplicate capture, cancelled booking, lost response aur processed refund tests ke baad hi separate live approval/release hoga. Test key dalne se live mode on nahi hota. Automatic split/commission deduction/refund initiation active nahi hain.

## 3. Meta WhatsApp / Ads

[Meta for Developers](https://developers.facebook.com/apps/) par business/app setup karein. Approved WhatsApp Business Account/number, text templates, customer opt-in aur required permissions ready karein. Tokens sirf secure business connection form/backend configuration mein jayenge; chat mein nahi.

WhatsApp webhook: `https://travel-booking-dnn.pages.dev/api/communications/webhook`. Approved platform provisioning/live flags aur backend encryption/signature secrets reviewed setup ka hissa hain. Pilot plain-text approved templates tak limited hai; bulk/media/button automation abhi nahi hai.

Meta ads callback: `https://travel-booking-dnn.pages.dev/api/integrations/meta/callback`. Har agency apna authorised account select karegi. Integration read-only spend data laata hai; ads/budget modify nahi karta.

## 4. Google Ads

[Google Cloud Console](https://console.cloud.google.com/) mein OAuth project/consent screen aur approved Ads API developer access ready karein. Exact callback: `https://travel-booking-dnn.pages.dev/api/integrations/google/callback`. Client secrets/encryption configuration backend par rahegi. Ek authorised business ka pilot successful hone ke baad native ads enable kiya jayega.

## 5. GST aur automation boundaries

Invoice issue karne se pehle agency ka legal name, address, valid GSTIN, place of supply, SAC aur accountant-approved tax treatment chahiye. Naya engine immutable invoices/credit notes aur PDF banata hai; government IRN registration/GST filing nahi karta. Credit note automatically refund nahi bhejta.

Inbound AI calls ke liye telephony/speech provider, consent, number, budget aur further implementation chahiye. Browser dictation ko phone-call agent nahi samjhein. General customer password accounts/pre-booking signed acceptance, live SaaS recurring billing, bulk/media WhatsApp aur unattended scheduling ko completed claim nahi kiya gaya.

## Deployment check

Cloudflare Worker aur Pages dono par latest main commit Success hona chahiye. `https://travel-booking-dnn.pages.dev/api/health/live` ka release ID match karein aur Ctrl+Shift+R se refresh karein. Naye tables additive migrations se aate hain; production database reset/delete/seed nahi karna.
