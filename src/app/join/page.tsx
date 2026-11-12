"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
export default function Join() {
  const { data: session, isPending } = authClient.useSession();
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    setToken(new URLSearchParams(location.search).get("token") || "");
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">YOUR TEAM IS WAITING</span>
        <h1>Join your agency.</h1>
        {done ? (
          <>
            <p className="info-box" role="status">
              Invitation accepted. Sign in again to open your team workspace.
            </p>
            <Link href="/login" className="btn primary">
              Sign in to your team
            </Link>
          </>
        ) : isPending ? (
          <p>Checking your session…</p>
        ) : !session ? (
          <>
            <p className="muted">
              Sign in or create an account using the email that received this
              invitation. Verify your email if requested, then reopen the
              invitation link from your inbox.
            </p>
            <Link href="/login" className="btn primary">
              Sign in
            </Link>
            <Link href="/login?signup=1" className="demo-link">
              Create an account
            </Link>
          </>
        ) : (
          <>
            <p className="muted">
              Signed in as {session.user.email}. Accepting joins the inviting
              agency. A populated existing workspace cannot be moved.
            </p>
            <button
              className="btn primary"
              disabled={busy || !token}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/invitations/accept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                  });
                  const body = await r.json();
                  if (!r.ok) throw new Error(body.error);
                  history.replaceState(null, "", "/join");
                  setToken("");
                  setDone(true);
                } catch (e) {
                  setError(
                    (e as Error).message || "Invitation could not be accepted.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Joining…" : "Accept invitation"}
            </button>
            {!token && (
              <p className="error-box">
                Open the complete invitation link from your email.
              </p>
            )}
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
