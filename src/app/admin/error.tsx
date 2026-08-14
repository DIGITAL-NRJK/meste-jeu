"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[REGIE] écran indisponible", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="regie-error">
      <section className="regie-error-panel" role="alert">
        <p className="eyebrow">Régie MESTE</p>
        <h1>Cet écran n’a pas pu s’afficher</h1>
        <p>
          Le jeu, les scores et le classement ne sont pas affectés : seule cette
          page de la régie a échoué. Réessayez, ou passez par un autre écran.
        </p>

        <div className="regie-error-actions">
          <button className="primary-button" type="button" onClick={reset}>
            Réessayer
          </button>
          <a className="regie-error-link" href="/admin">
            Vue de la salle
          </a>
          <a className="regie-error-link" href="/admin/sessions">
            Conducteur
          </a>
        </div>

        <p className="regie-error-digest">
          Référence technique : <code>{error.digest ?? "non disponible"}</code>
          <br />
          Communiquez-la avec l’heure exacte pour retrouver la trace serveur.
        </p>
      </section>
    </main>
  );
}
