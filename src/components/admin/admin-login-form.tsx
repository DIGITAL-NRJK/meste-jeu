"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
      };

      if (!response.ok) {
        setError(payload.error?.message ?? "La connexion a échoué.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("La régie est momentanément inaccessible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-orbit" aria-hidden="true" />
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <div className="admin-login-brand">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>
            <strong>MESTE</strong>
            <small>Régie Héritage Congo</small>
          </span>
        </div>

        <div className="admin-login-heading">
          <p className="eyebrow">Accès réservé</p>
          <h1 id="admin-login-title">Entrer en régie</h1>
          <p>Connectez-vous pour superviser le quiz et suivre la salle.</p>
        </div>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Adresse email</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
          />

          <label htmlFor="admin-password">Mot de passe</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Vérification…" : "Ouvrir la régie"}
            {!submitting ? <span aria-hidden="true">→</span> : null}
          </button>
        </form>

        <p className="admin-login-note">
          Session privée · Les identifiants ne sont jamais enregistrés dans le navigateur
        </p>
      </section>
    </main>
  );
}
