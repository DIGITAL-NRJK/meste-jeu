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
    console.error("[GLOBAL] écran indisponible", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          background: "#071a14",
          color: "#f8f2e5",
          fontFamily: "Avenir Next, Avenir, Segoe UI, sans-serif",
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
            Héritage Congo est momentanément indisponible
          </h1>
          <p style={{ color: "#b9c5bd", lineHeight: 1.6 }}>
            Vos points et votre place au classement sont conservés sur le
            serveur. Réessayez dans quelques instants.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.85rem 1.6rem",
              borderRadius: "999px",
              border: "none",
              background: "#f2c14e",
              color: "#071a14",
              fontSize: "1rem",
              fontWeight: 600,
            }}
            type="button"
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
