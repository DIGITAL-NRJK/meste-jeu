"use client";

import { useEffect } from "react";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[JOUEUR] écran indisponible", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="public-error">
      <section className="public-error-panel" role="alert">
        <span className="brand-mark" aria-hidden="true">M</span>
        <h1>Un instant</h1>
        <p>
          Le jeu n’a pas pu s’afficher. Vos points et votre place au classement
          sont conservés : ils sont enregistrés sur le serveur.
        </p>
        <button className="primary-button" type="button" onClick={reset}>
          Réessayer
        </button>
        <p className="public-error-hint">
          Si l’écran reste bloqué, fermez puis rouvrez le lien reçu sur WhatsApp.
        </p>
      </section>
    </main>
  );
}
