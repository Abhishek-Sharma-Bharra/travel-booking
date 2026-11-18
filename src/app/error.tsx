"use client";
export default function Error({ retry }: { retry: () => void }) {
  return (
    <main className="loading">
      <h1>We couldn’t load this workspace.</h1>
      <p>
        Please try again in a moment. If you were saving or paying, check your
        records before repeating the action.
      </p>
      <button className="btn primary" onClick={retry}>
        Try again
      </button>
      <a href="/">Back to home</a>
    </main>
  );
}
