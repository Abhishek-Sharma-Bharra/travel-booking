# Email verification aur password recovery — Cloudflare

Current code Cloudflare Worker par HTTP-based **Resend** provider use karta hai. Node/PostgreSQL deployment ka SMTP mode Worker par use nahi hota. Chat mein keys/password bhejne ki zaroorat nahi.

1. Resend account aur apna verified sending domain/sender taiyar karein. Domain aapka hona chahiye; DNS/provider verification apne account mein complete karein. Provider quota/pricing check karein; code unlimited/free emails assume nahi karta.
2. Cloudflare → Workers & Pages → `vashisht-travelos-api-staging` → Settings → Variables and Secrets mein `RESEND_API_KEY` **secret** aur approved `MAIL_FROM` set karein. Real values chat ya Git mein na daalein. Public application origin `https://travel-booking-dnn.pages.dev` hi rehna chahiye.
3. Paired Worker release ke baad apne test account se signup/resend verification aur forgot-password flows test karein. Email receive hona, correct HTTPS return link, one-use/expiry aur account access verify karein; production customer records se testing na karein.
4. Delivery prove hone ke baad versioned `cloudflare/worker/wrangler.jsonc` mein `REQUIRE_EMAIL_VERIFICATION` ko `"true"` karke reviewed release karein. Sirf dashboard override par depend na karein: agla Git deploy repository ki value dobara apply kar sakta hai.
5. Existing unverified users ke liye resend/delivery process verify karein. Verification enforce karne se pehle working delivery chahiye; bypass karke account verified mark na karein.

Email provider account/verified sender abhi confirm nahi hai. `MAIL_FROM`/key present hona delivery proof nahi. Mandatory verification ko bina delivery test ke enable nahi kiya gaya. Platform administrator ko verified identity, configured allowlist aur authenticator/MFA chahiye; normal agency owner ko platform admin access nahi milta.
