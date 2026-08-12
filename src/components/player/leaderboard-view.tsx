"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BrandHeader } from "@/components/player/brand-header";
import {
  formatPoints,
  getLeaderboardPollingDelay,
} from "@/lib/game/player-interface";
import type { Leaderboard, LeaderboardEntry } from "@/server/services/leaderboard";

type EventState = {
  event: { slug: string; name: string; status: string };
  session: { id: string; name: string; status: string } | null;
};

type ApiError = { error?: { message?: string } };

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function Position({ value }: { value: number }) {
  return (
    <span className={`leaderboard-position${value <= 3 ? " leaderboard-position--honor" : ""}`}>
      {String(value).padStart(2, "0")}
    </span>
  );
}

function LeaderboardRow({
  entry,
  current,
}: {
  entry: LeaderboardEntry;
  current: boolean;
}) {
  return (
    <li className={`leaderboard-row${current ? " leaderboard-row--current" : ""}`}>
      <Position value={entry.position} />
      <span className="leaderboard-identity">
        <strong>{entry.nickname}</strong>
        <small>{current ? "Vous" : entry.publicCode}</small>
      </span>
      <strong className="leaderboard-points">{formatPoints(entry.points)}</strong>
    </li>
  );
}

export function LeaderboardView({
  eventSlug,
  initialSessionId,
}: {
  eventSlug: string;
  initialSessionId: string | null;
}) {
  const [session, setSession] = useState<EventState["session"]>(null);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadEventState() {
      try {
        const response = await fetch(`/api/events/${eventSlug}/state`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const state = await readJson<EventState>(response);
        if (active) setSession(state.session);
      } catch {
        // Le classement général reste utilisable sans raccourci de session.
      }
    }

    void loadEventState();
    return () => {
      active = false;
    };
  }, [eventSlug]);

  const refresh = useCallback(async () => {
    const query = new URLSearchParams({ eventSlug });
    if (selectedSessionId) query.set("sessionId", selectedSessionId);

    const response = await fetch(`/api/leaderboard?${query}`, {
      cache: "no-store",
    });
    const body = await readJson<Leaderboard & ApiError>(response);

    if (!response.ok) {
      throw new Error(body.error?.message ?? "Le classement est indisponible.");
    }

    setLeaderboard(body);
    setStatus("ready");
    setError(null);
  }, [eventSlug, selectedSessionId]);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;

    async function poll() {
      try {
        await refresh();
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Le classement est indisponible.");
          setStatus((current) => (current === "loading" ? "error" : current));
        }
      } finally {
        if (active) {
          timeoutId = window.setTimeout(
            poll,
            getLeaderboardPollingDelay(Math.random()),
          );
        }
      }
    }

    void poll();
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  const currentInTop = Boolean(
    leaderboard?.currentPlayer &&
      leaderboard.entries.some(
        (entry) => entry.publicCode === leaderboard.currentPlayer?.publicCode,
      ),
  );

  return (
    <main className="leaderboard-page">
      <div className="leaderboard-frame">
        <nav className="leaderboard-nav">
          <BrandHeader compact />
          <Link href={`/play/${eventSlug}`}>Retour au jeu</Link>
        </nav>

        <header className="leaderboard-heading">
          <p className="eyebrow">Table d’honneur</p>
          <h1>Classement</h1>
          <p>
            {leaderboard?.participantCount ?? 0} participant
            {(leaderboard?.participantCount ?? 0) > 1 ? "s" : ""} classé
            {(leaderboard?.participantCount ?? 0) > 1 ? "s" : ""}
          </p>
        </header>

        {session ? (
          <div className="leaderboard-scopes" aria-label="Portée du classement">
            <button
              type="button"
              aria-pressed={selectedSessionId === null}
              onClick={() => {
                setStatus("loading");
                setSelectedSessionId(null);
              }}
            >
              Général
            </button>
            <button
              type="button"
              aria-pressed={selectedSessionId === session.id}
              onClick={() => {
                setStatus("loading");
                setSelectedSessionId(session.id);
              }}
            >
              Session
            </button>
          </div>
        ) : null}

        {status === "loading" ? (
          <div className="leaderboard-loading" role="status">
            <span /> Mise à jour du classement…
          </div>
        ) : null}

        {status === "error" ? (
          <section className="leaderboard-empty" role="alert">
            <h2>Le classement fait une pause</h2>
            <p>{error}</p>
            <button type="button" onClick={() => void refresh()}>
              Réessayer
            </button>
          </section>
        ) : null}

        {status === "ready" && leaderboard ? (
          <>
            <p className="leaderboard-scope-name">
              {leaderboard.scope.type === "SESSION"
                ? leaderboard.scope.name
                : leaderboard.event.name}
            </p>
            {leaderboard.currentPlayer && !currentInTop ? (
              <aside className="current-rank" aria-label="Votre position">
                <span>Votre position</span>
                <div>
                  <Position value={leaderboard.currentPlayer.position} />
                  <strong>{leaderboard.currentPlayer.nickname}</strong>
                  <b>{formatPoints(leaderboard.currentPlayer.points)} pts</b>
                </div>
              </aside>
            ) : null}
            {leaderboard.entries.length > 0 ? (
              <ol className="leaderboard-list">
                {leaderboard.entries.map((entry) => (
                  <LeaderboardRow
                    key={entry.publicCode}
                    entry={entry}
                    current={
                      entry.publicCode === leaderboard.currentPlayer?.publicCode
                    }
                  />
                ))}
              </ol>
            ) : (
              <section className="leaderboard-empty">
                <h2>La première place vous attend</h2>
                <p>Les scores apparaîtront dès la première réponse comptabilisée.</p>
              </section>
            )}

          </>
        ) : null}

        {error && status === "ready" ? (
          <p className="leaderboard-stale" role="status">
            Dernière version affichée · Reconnexion automatique
          </p>
        ) : null}
      </div>
    </main>
  );
}
