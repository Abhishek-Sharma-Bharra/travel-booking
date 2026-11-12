"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
export default function Forgot() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h1>Forgot your password?</h1>
        <p className="muted">
          We will email a one-time reset link if an account exists.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const email = String(
              new FormData(e.currentTarget).get("email"),
            ).trim();
            setBusy(true);
            setError("");
            try {
              const r = await authClient.requestPasswordReset({
                email,
                redirectTo: "/reset-password",
              });
              if (r.error)
                throw new Error(
                  r.error.message ||
                    "Email delivery is unavailable. Contact support.",
                );
              setMessage(
                "If the account exists and email delivery is available, you will receive a password-reset email. Check your inbox and spam folder. The link expires in 30 minutes.",
              );
            } catch (e) {
              setError(
                (e as Error).message ||
                  "Your request could not be completed. Please retry.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Account email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          {message && (
            <p role="status" className="info-box">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <button className="btn primary" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <Link className="demo-link" href="/login">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
