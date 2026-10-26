"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Compass, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
export default function Login() {
  const formRef = useRef<HTMLFormElement>(null);
  const [notice, setNotice] = useState("");
  const [signup, setSignup] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setSignup(new URLSearchParams(location.search).has("signup"));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    if (signup && (name.length < 2 || name.length > 100)) {
      setError("Please enter your name using 2 to 100 characters.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError(
        "Your password must contain 12 to 128 characters. Please enter the full password.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = signup
        ? await authClient.signUp.email({
            name,
            callbackURL: "/workspace",
            email,
            password,
          })
        : await authClient.signIn.email({
            email,
            password,
          });
      if (result.error) {
        const status = result.error.status;
        const message =
          String(result.error.code) === "ACCOUNT_DISABLED"
            ? "Your account is disabled. Contact your agency owner."
            : result.error.code === "EMAIL_NOT_VERIFIED"
              ? "Verify your email before signing in. Use Resend verification email below."
              : status === 403
                ? "Sign-in is blocked by the website configuration. Please contact the agency administrator."
                : status === 429
                  ? "Too many attempts. Please wait a minute and try again."
                  : status >= 500
                    ? "The server could not complete your request. Please try again or contact support."
                    : result.error.message ||
                      "Your request could not be completed. Please check your details and try again.";
        throw new Error(message);
      }
      if (
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect
      ) {
        location.href = "/two-factor";
        return;
      }
      if (!result.data?.user?.id)
        throw new Error(
          "The server did not confirm your account. Please try signing in or contact support.",
        );
      if (signup && !result.data.token) {
        setNotice(
          "Account created. Check your inbox and verify your email before signing in. The link expires in one hour.",
        );
        return;
      }
      location.href = "/workspace";
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        /abort|timeout|timed out/i.test(message)
          ? "The server took too long to respond. If you were creating an account, try signing in before creating it again."
          : /fetch|network/i.test(message)
            ? "We could not reach the server. Check your connection and try again."
            : message ||
              "We could not complete your request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        <Compass size={32} />
        vashisht <small>TRAVELOS</small>
      </Link>
      <section className="auth-card">
        <span className="eyebrow">YOUR NEXT CHAPTER</span>
        <h1>{signup ? "Let’s build your agency." : "Welcome back."}</h1>
        <p className="muted">
          {signup
            ? "A dedicated workspace for your team and your journeys."
            : "Your journeys, people and numbers, together."}
        </p>
        <form
          ref={formRef}
          onSubmit={submit}
          method="post"
          noValidate
          aria-busy={busy}
        >
          {signup && (
            <label>
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Work email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              aria-label="Password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
            />
            <small>At least 12 characters.</small>
          </label>
          {notice && (
            <div role="status" className="info-box">
              {notice}
            </div>
          )}
          {error && (
            <div role="alert" aria-live="assertive" className="error-box">
              {error}
            </div>
          )}
          <button disabled={busy} className="btn primary">
            {busy ? "Please wait…" : signup ? "Create workspace" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="auth-help">
          <Link href="/forgot-password" className="text-button">
            Forgot password?
          </Link>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={async () => {
              if (!formRef.current) return;
              const email = String(
                new FormData(formRef.current).get("email") || "",
              ).trim();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                setError("Enter your email above, then resend verification.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                const r = await authClient.sendVerificationEmail({
                  email,
                  callbackURL: "/workspace",
                });
                if (r.error)
                  throw new Error(
                    r.error.message ||
                      "Verification email is unavailable. Contact support.",
                  );
                setNotice(
                  "If verification is needed, an email will be sent. Check your inbox and spam folder.",
                );
              } catch (e) {
                setError(
                  (e as Error).message ||
                    "Email could not be sent. Contact support.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Resend verification email
          </button>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setError("");
          }}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an agency"}
        </button>
        <Link className="demo-link" href="/demo">
          Just looking? Explore the read-only demo →
        </Link>
      </section>
      <p className="auth-foot">
        <Link href="/privacy">Privacy information</Link> ·{" "}
        <Link href="/terms">Pilot terms</Link>
      </p>
      <p className="auth-foot">
        Vashisht Analytics · No live billing or payment processing
      </p>
    </main>
  );
}
