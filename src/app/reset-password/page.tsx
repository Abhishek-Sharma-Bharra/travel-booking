"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
export default function Reset() {
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    setToken(query.get("token") || "");
    if (query.get("error"))
      setError(
        "This password-reset link is invalid or expired. Request a new one.",
      );
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">A FRESH START</span>
        <h1>Reset your password.</h1>
        {done ? (
          <>
            <p role="status" className="info-box">
              Password changed. All previous sessions have been revoked.
            </p>
            <Link href="/login" className="btn primary">
              Sign in
            </Link>
          </>
        ) : (
          <form
            noValidate
            method="post"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget),
                password = String(f.get("password")),
                confirm = String(f.get("confirm"));
              setError("");
              if (password.length < 12 || password.length > 128) {
                setError("Use a password with 12 to 128 characters.");
                return;
              }
              if (password !== confirm) {
                setError("Passwords do not match.");
                return;
              }
              if (!token) {
                setError(
                  "This link is incomplete. Request a new password-reset email.",
                );
                return;
              }
              setBusy(true);
              try {
                const r = await authClient.resetPassword({
                  newPassword: password,
                  token,
                });
                if (r.error)
                  throw new Error(
                    r.error.message || "The reset link is invalid or expired.",
                  );
                history.replaceState(null, "", "/reset-password");
                setToken("");
                setDone(true);
              } catch (e) {
                setError(
                  (e as Error).message ||
                    "Password could not be reset. Request a new link.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Reset password"}
            </button>
            <Link className="text-button" href="/forgot-password">
              Request a new link
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}
