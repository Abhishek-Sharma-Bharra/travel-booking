"use client";
import { useEffect, useState } from "react";
export default function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 20000);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="loading">
      <span className="spinner" />
      <h2>Preparing your workspace…</h2>
      <p>
        {slow
          ? "This is taking longer than expected. Free hosting may be waking up."
          : "Bringing your journeys and numbers together."}
      </p>
      {slow && (
        <button
          className="btn secondary"
          onClick={() => window.location.reload()}
        >
          Retry loading
        </button>
      )}
    </main>
  );
}
