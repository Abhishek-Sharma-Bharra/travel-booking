"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
export default function TwoFactor() {
  const [backup, setBackup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">ONE MORE STEP</span>
        <h1>Verify it’s you.</h1>
        <p className="muted">
          {backup
            ? "Enter one unused recovery code."
            : "Open your authenticator app and enter its current six-digit code."}
        </p>
        <form
          method="post"
          onSubmit={async (e) => {
            e.preventDefault();
            const code = String(
              new FormData(e.currentTarget).get("code"),
            ).trim();
            setBusy(true);
            setError("");
            try {
              const r = backup
                ? await authClient.twoFactor.verifyBackupCode({ code })
                : await authClient.twoFactor.verifyTotp({
                    code,
                    trustDevice: false,
                  });
              if (r.error)
                throw new Error(r.error.message || "Verification failed.");
              location.href =
                new URLSearchParams(location.search).get("next") === "admin"
                  ? "/admin"
                  : "/workspace";
            } catch (e) {
              setError((e as Error).message || "Could not verify this code.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {backup ? "Recovery code" : "Authenticator code"}
            <input
              key={String(backup)}
              name="code"
              type="text"
              autoComplete="one-time-code"
              inputMode={backup ? "text" : "numeric"}
              pattern={backup ? undefined : "[0-9]{6}"}
              required
              maxLength={64}
            />
          </label>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <button className="btn primary" disabled={busy}>
            {busy ? "Verifying…" : "Verify and sign in"}
          </button>
        </form>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setBackup(!backup);
            setError("");
          }}
        >
          {backup ? "Use authenticator code" : "Use a recovery code instead"}
        </button>
        <Link className="demo-link" href="/login">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
