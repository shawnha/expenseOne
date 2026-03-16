"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);

    // If this is a ChunkLoadError (stale SW cache after deployment),
    // force a full page reload to fetch fresh HTML with correct chunk hashes.
    if (
      error.message?.includes("ChunkLoadError") ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("Importing a module script failed")
    ) {
      // Unregister service workers so they don't serve stale content again
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((r) => r.unregister());
        });
      }
      // Hard reload to get fresh HTML from the server
      window.location.reload();
      return;
    }
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif",
          backgroundColor: "#f2f2f7",
          color: "#1c1c1e",
        }}
      >
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#FF3B30",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 8,
              letterSpacing: "-0.01em",
            }}
          >
            오류가 발생했습니다
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#8e8e93",
              marginBottom: 24,
              maxWidth: 320,
              lineHeight: 1.5,
            }}
          >
            일시적인 오류가 발생했습니다. 다시 시도해주세요.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                padding: "12px 24px",
                borderRadius: 9999,
                border: "none",
                background: "#007AFF",
                color: "white",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            <button
              onClick={() => {
                if ("serviceWorker" in navigator) {
                  navigator.serviceWorker.getRegistrations().then((regs) => {
                    regs.forEach((r) => r.unregister());
                  });
                }
                window.location.href = "/";
              }}
              style={{
                padding: "12px 24px",
                borderRadius: 9999,
                border: "1px solid rgba(0,0,0,0.1)",
                background: "rgba(255,255,255,0.7)",
                color: "#1c1c1e",
                fontSize: 15,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              홈으로 이동
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
