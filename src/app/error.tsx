"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="loading">
      <h1>We couldn’t load this workspace.</h1>
      <p>
        Please check the database connection and run the migrations and demo
        seed.
      </p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
      <a href="/">Back to home</a>
    </main>
  );
}
