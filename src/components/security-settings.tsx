"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
export default function SecuritySettings() {
  const { data: session } = authClient.useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [setup, setSetup] = useState<{ secret: string; codes: string[] } | null>(
      null,
    );
  const enabled = !!session?.user.twoFactorEnabled;
  return (
    <section className="panel prose">
      <h2>Two-factor authentication</h2>
      <p>
        Add an authenticator app to protect your account. Required for service
        administrators. Recovery codes are shown during setup; store them
        privately, outside this app.
      </p>
      {setup ? (
        <>
          <p>
            In Google Authenticator, Microsoft Authenticator or another
            compatible app, choose “Enter setup key”, use your account email,
            and choose time-based codes.
          </p>
          <label>
            Private setup key
            <input
              readOnly
              value={setup.secret}
              aria-label="Private authenticator setup key"
            />
          </label>
          <p className="method-note">
            Do not share this key or send it to support.
          </p>
          <h3>Save these one-time recovery codes</h3>
          <pre className="info-box">{setup.codes.join("\n")}</pre>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code"));
              setBusy(true);
              setError("");
              try {
                const r = await authClient.twoFactor.verifyTotp({ code });
                if (r.error) throw new Error(r.error.message || "Invalid code");
                setSetup(null);
                setNotice(
                  "Two-factor authentication is enabled. Keep your saved recovery codes private.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Current six-digit authenticator code
              <input
                name="code"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
              />
            </label>
            <button disabled={busy} className="btn primary">
              Confirm authenticator setup
            </button>
          </form>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const password = String(
              new FormData(e.currentTarget).get("password"),
            );
            setBusy(true);
            setError("");
            setNotice("");
            try {
              if (enabled) {
                const r = await authClient.twoFactor.disable({ password });
                if (r.error)
                  throw new Error(
                    r.error.message ||
                      "Could not disable two-factor authentication",
                  );
                setNotice(
                  "Two-factor authentication disabled. Service administrator access is unavailable until you enable it again.",
                );
              } else {
                const r = await authClient.twoFactor.enable({ password });
                if (r.error)
                  throw new Error(
                    r.error.message || "Could not start authenticator setup",
                  );
                if (
                  !r.data ||
                  !("totpURI" in r.data) ||
                  !r.data.totpURI ||
                  !("backupCodes" in r.data)
                )
                  throw new Error("Authenticator setup was not confirmed");
                setSetup({
                  secret:
                    new URL(r.data.totpURI).searchParams.get("secret") || "",
                  codes: r.data.backupCodes,
                });
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Confirm your current password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button className="btn secondary" disabled={busy}>
            {busy
              ? "Please wait…"
              : enabled
                ? "Disable two-factor authentication"
                : "Set up authenticator app"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="info-box">
          {notice}
        </p>
      )}
    </section>
  );
}
