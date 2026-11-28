"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import SecuritySettings from "./security-settings";
export default function AdminOnboarding({
  email,
  verified,
  emailConfigured,
}: {
  email: string;
  verified: boolean;
  emailConfigured: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <>
      <section className="panel">
        <h2>1. Verify your administrator email</h2>
        <p>
          {email} ·{" "}
          {verified ? "Email verified" : "Email verification required"}
        </p>
        {!emailConfigured && !verified && (
          <p>
            Email delivery must be configured before a verification message can
            be sent. Configure the approved sender and Resend server secret in
            Cloudflare; never put the key in this form.
          </p>
        )}
        {!verified && (
          <button
            className="btn primary"
            disabled={!emailConfigured || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await authClient.sendVerificationEmail({
                  email,
                  callbackURL: new URL("/admin/setup", location.origin).href,
                });
                setNotice(
                  r.error?.message ||
                    "Verification email requested. Check your inbox and spam folder.",
                );
              } catch {
                setNotice(
                  "Verification could not be requested. Check delivery configuration.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Requesting…" : "Send administrator verification email"}
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
      {verified ? (
        <SecuritySettings />
      ) : (
        <section className="panel">
          <h2>2. Set up your authenticator</h2>
          <p>
            Verify your email first, then return here to enrol your
            authenticator.
          </p>
        </section>
      )}
      <section className="panel">
        <h2>3. Open platform administration</h2>
        <p>
          Verified email, an enabled authenticator and a fresh MFA verification
          are all required. This setup page does not grant access to customer
          records.
        </p>
        <a className="btn primary" href="/admin">
          Open platform administration
        </a>
      </section>
    </>
  );
}
