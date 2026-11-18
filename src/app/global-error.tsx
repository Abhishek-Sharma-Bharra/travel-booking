"use client";
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#f5f8fb",
          color: "#21344a",
          padding: "10vh 7vw",
        }}
      >
        <main>
          <h1>We couldn’t load this page.</h1>
          <p>
            If you were saving or paying, check your records before trying
            again.
          </p>
          <button onClick={retry}>Try again</button>
          <p>
            <a href="/">Back to home</a>
          </p>
        </main>
      </body>
    </html>
  );
}
