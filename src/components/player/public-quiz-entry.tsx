"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PublicEventResponse = {
  event: {
    slug: string;
    name: string;
  } | null;
};

export function PublicQuizEntry() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function openQuiz() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/events/active", { cache: "no-store" });
      const payload = (await response.json()) as PublicEventResponse;

      if (!response.ok || !payload.event) {
        setMessage("Les inscriptions ne sont pas ouvertes pour le moment.");
        return;
      }

      router.push(`/play/${encodeURIComponent(payload.event.slug)}`);
    } catch {
      setMessage("Connexion impossible. Réessayez dans quelques instants.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="landing-entry">
      <button
        className="primary-button landing-button"
        type="button"
        disabled={pending}
        onClick={openQuiz}
      >
        {pending ? "Ouverture…" : "Participer au quiz"}
        <span aria-hidden="true">→</span>
      </button>
      {message ? (
        <p className="landing-unavailable" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
