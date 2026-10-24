"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Compass, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
export default function Login() {
  const [signup, setSignup] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setSignup(new URLSearchParams(location.search).has("signup"));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = signup
        ? await authClient.signUp.email({
            name: String(f.get("name")),
            email: String(f.get("email")),
            password: String(f.get("password")),
          })
        : await authClient.signIn.email({
            email: String(f.get("email")),
            password: String(f.get("password")),
          });
      if (result.error) throw new Error(result.error.message);
      location.href = "/workspace";
    } catch (e) {
      setError((e as Error).message);
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
        <form onSubmit={submit}>
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
          {error && (
            <div role="alert" className="error-box">
              {error}
            </div>
          )}
          <button disabled={busy} className="btn primary">
            {busy ? "Please wait…" : signup ? "Create workspace" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <button
          className="text-button"
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
        Vashisht Analytics · No live billing or payment processing
      </p>
    </main>
  );
}
