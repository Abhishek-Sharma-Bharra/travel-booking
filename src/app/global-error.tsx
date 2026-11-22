"use client";
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Segoe UI, Arial, sans-serif",
          background: "#faf8ff",
          color: "#1b2943",
          padding: "10vh 7vw",
        }}
      >
        <main>
          <h1>We couldn’t load this page.</h1>
          <p>
            If you were saving or paying, check your records before trying
            again.
          </p>
          <button
            onClick={retry}
            style={{
              background: "linear-gradient(110deg,#7044d9,#4264d6)",
              color: "white",
              border: 0,
              borderRadius: 10,
              padding: "13px 22px",
              minHeight: 44,
              font: "600 14px Segoe UI,Arial,sans-serif",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <p>
            <a href="/">Back to home</a>
          </p>
        </main>
      </body>
    </html>
  );
}
