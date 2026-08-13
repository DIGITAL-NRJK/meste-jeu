"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AdminIdentity } from "@/server/services/admin-auth";
import type {
  AdminPlayerAnswer,
  AdminPlayerDetail,
  AdminPlayerEvent,
  AdminPlayerScoreAdjustment,
  AdminPlayerSummary,
} from "@/server/services/admin-player-management";

export type AdminPlayerSummaryView = Omit<
  AdminPlayerSummary,
  "createdAt" | "lastSeenAt"
> & {
  createdAt: string;
  lastSeenAt: string;
};

type AdminPlayerAnswerView = Omit<AdminPlayerAnswer, "receivedAt"> & {
  receivedAt: string;
};

type AdminPlayerScoreAdjustmentView = Omit<
  AdminPlayerScoreAdjustment,
  "createdAt"
> & { createdAt: string };

type AdminPlayerDetailView = Omit<
  AdminPlayerDetail,
  "createdAt" | "lastSeenAt" | "answers" | "scoreAdjustments"
> & {
  createdAt: string;
  lastSeenAt: string;
  answers: AdminPlayerAnswerView[];
  scoreAdjustments: AdminPlayerScoreAdjustmentView[];
};

type ApiErrorPayload = { error?: { message?: string } };

const questionStatusLabels = {
  PENDING: "À venir",
  OPEN: "Ouverte",
  CLOSED: "Fermée",
  REVEALED: "Révélée",
  CANCELED: "Annulée",
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatResponseTime(milliseconds: number) {
  return `${(milliseconds / 1_000).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} s`;
}

export function AdminPlayerManagementView({
  admin,
  initialEvents,
  initialEvent,
  initialPlayers,
}: {
  admin: AdminIdentity;
  initialEvents: AdminPlayerEvent[];
  initialEvent: AdminPlayerEvent | null;
  initialPlayers: AdminPlayerSummaryView[];
}) {
  const router = useRouter();
  const [eventSlug, setEventSlug] = useState(initialEvent?.slug ?? "");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [players, setPlayers] = useState(initialPlayers);
  const [selectedPlayer, setSelectedPlayer] =
    useState<AdminPlayerDetailView | null>(null);
  const [listPending, setListPending] = useState(false);
  const [detailPending, setDetailPending] = useState(false);
  const [disablePending, setDisablePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [adjustmentPending, setAdjustmentPending] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    quizSessionId: "",
    points: "",
    reason: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const currentEvent = initialEvents.find(
    (candidate) => candidate.slug === eventSlug,
  );

  async function apiFetch(input: string, init?: RequestInit) {
    const response = await fetch(input, { cache: "no-store", ...init });

    if (response.status === 401) {
      router.replace("/admin/login");
      router.refresh();
      throw new Error("La session administrateur n’est plus valide.");
    }

    return response;
  }

  async function responseError(response: Response) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    return payload.error?.message ?? "L’action n’a pas pu être effectuée.";
  }

  async function refreshPlayers(nextEventSlug = eventSlug) {
    if (!nextEventSlug) return;

    setListPending(true);
    setMessage(null);
    const params = new URLSearchParams({
      eventSlug: nextEventSlug,
      limit: "100",
    });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);

    try {
      const response = await apiFetch(`/api/admin/players?${params}`);
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as {
        players: AdminPlayerSummaryView[];
      };
      setPlayers(payload.players);
      setSelectedPlayer(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Joueurs indisponibles.");
    } finally {
      setListPending(false);
    }
  }

  async function selectPlayer(playerId: string) {
    setDetailPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/players/${playerId}`);
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { player: AdminPlayerDetailView };
      setSelectedPlayer(payload.player);
      setAdjustmentForm({
        quizSessionId:
          payload.player.scoreSessions.find(
            (session) => session.status !== "CANCELED",
          )?.id ?? "",
        points: "",
        reason: "",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Joueur indisponible.");
    } finally {
      setDetailPending(false);
    }
  }

  async function disablePlayer() {
    if (
      !selectedPlayer ||
      selectedPlayer.status === "DISABLED" ||
      !window.confirm(
        `Désactiver ${selectedPlayer.nickname} ? Ses connexions seront immédiatement révoquées.`,
      )
    ) {
      return;
    }

    setDisablePending(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/admin/players/${selectedPlayer.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "DISABLE" }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { player: AdminPlayerDetailView };
      setSelectedPlayer(payload.player);
      setPlayers((current) =>
        status === "ACTIVE"
          ? current.filter((player) => player.id !== payload.player.id)
          : current.map((player) =>
              player.id === payload.player.id
                ? { ...player, status: "DISABLED" as const }
                : player,
            ),
      );
      setMessage("Joueur désactivé. Ses sessions de connexion ont été révoquées.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Désactivation refusée.");
    } finally {
      setDisablePending(false);
    }
  }

  async function deletePlayer() {
    if (
      !selectedPlayer ||
      selectedPlayer.event.environment !== "TEST" ||
      selectedPlayer.event.status === "FINISHED" ||
      !window.confirm(
        `Supprimer définitivement ${selectedPlayer.nickname} de cet événement de test ?\n\nSes réponses, son score, ses connexions et ses éventuelles récompenses seront supprimés. Cette action est irréversible.`,
      )
    ) {
      return;
    }

    setDeletePending(true);
    setMessage(null);
    try {
      const deletedPlayerId = selectedPlayer.id;
      const response = await apiFetch(
        `/api/admin/players/${deletedPlayerId}/actions`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await responseError(response));
      setPlayers((current) =>
        current.filter((player) => player.id !== deletedPlayerId),
      );
      setSelectedPlayer(null);
      setMessage("Joueur de test supprimé avec toutes ses données de participation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Suppression refusée.");
    } finally {
      setDeletePending(false);
    }
  }

  async function adjustScore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlayer) return;

    const points = Number(adjustmentForm.points);
    const reason = adjustmentForm.reason.trim();
    const session = selectedPlayer.scoreSessions.find(
      (candidate) => candidate.id === adjustmentForm.quizSessionId,
    );
    if (!Number.isInteger(points) || points === 0 || !session || reason.length < 5) {
      setMessage("Choisissez une session, un nombre entier non nul et un motif précis.");
      return;
    }

    const signedPoints = `${points > 0 ? "+" : ""}${points}`;
    if (
      !window.confirm(
        `Appliquer ${signedPoints} points à ${selectedPlayer.nickname} pour « ${session.name} » ?\nMotif : ${reason}`,
      )
    ) {
      return;
    }

    setAdjustmentPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/admin/players/${selectedPlayer.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ADJUST_SCORE",
            quizSessionId: session.id,
            points,
            reason,
          }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as { player: AdminPlayerDetailView };
      setSelectedPlayer(payload.player);
      setPlayers((current) =>
        current.map((player) =>
          player.id === payload.player.id
            ? { ...player, totalPoints: payload.player.totalPoints }
            : player,
        ),
      );
      setAdjustmentForm({
        quizSessionId: session.id,
        points: "",
        reason: "",
      });
      setMessage(
        `Ajustement ${signedPoints} enregistré dans le ledger et le journal d’audit.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ajustement refusé.");
    } finally {
      setAdjustmentPending(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refreshPlayers();
  }

  function changeEvent(nextEventSlug: string) {
    setEventSlug(nextEventSlug);
    router.replace(
      nextEventSlug
        ? `/admin/players?event=${encodeURIComponent(nextEventSlug)}`
        : "/admin/players",
      { scroll: false },
    );
    void refreshPlayers(nextEventSlug);
  }

  return (
    <main className="admin-page admin-players-page">
      <header className="admin-topbar">
        <div className="admin-wordmark">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>
            <strong>RÉGIE MESTE</strong>
            <small>Héritage Congo</small>
          </span>
        </div>
        <div className="admin-account">
          <span>{admin.displayName}</span>
          <button type="button" onClick={logout}>Se déconnecter</button>
        </div>
      </header>

      <div className="player-management-shell">
        <section className="player-management-hero">
          <div>
            <Link href={eventSlug ? `/admin?event=${encodeURIComponent(eventSlug)}` : "/admin"}>
              ← Retour à la régie
            </Link>
            <p className="eyebrow">Participants</p>
            <h1>Gestion des joueurs</h1>
            <p>Retrouvez un joueur, contrôlez son historique et sécurisez son accès.</p>
          </div>
          {initialEvents.length ? (
            <label className="admin-event-select">
              <span>Événement</span>
              <select value={eventSlug} onChange={(event) => changeEvent(event.target.value)}>
                {initialEvents.map((event) => (
                  <option key={event.id} value={event.slug}>
                    {event.environment === "TEST" ? "[TEST] " : ""}{event.name}
                  </option>
                ))}
              </select>
              {currentEvent ? (
                <small>
                  {currentEvent.environment === "TEST"
                    ? "Contexte test : les joueurs peuvent être supprimés avant clôture."
                    : "Contexte production : les joueurs peuvent uniquement être désactivés."}
                </small>
              ) : null}
            </label>
          ) : null}
        </section>

        {message ? <p className="player-management-message" role="status">{message}</p> : null}

        {!initialEvent ? (
          <section className="admin-empty-state">
            <p className="eyebrow">Aucun événement</p>
            <h2>Aucun joueur ne peut encore être inscrit.</h2>
            <Link href="/admin/sessions">Créer la première programmation →</Link>
          </section>
        ) : (
          <div className="player-management-workspace">
            <section className="player-management-index" aria-busy={listPending}>
              <div className="player-management-index-heading">
                <div>
                  <p className="eyebrow">Répertoire</p>
                  <h2>{players.length} joueur{players.length === 1 ? "" : "s"}</h2>
                </div>
              </div>

              <form className="player-management-filters" onSubmit={submitFilters}>
                <label>
                  <span>Pseudo ou code public</span>
                  <input
                    type="search"
                    value={search}
                    maxLength={80}
                    placeholder="Ex. Mwana ou AB12CD"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label>
                  <span>Statut</span>
                  <select value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="">Tous</option>
                    <option value="ACTIVE">Actifs</option>
                    <option value="DISABLED">Désactivés</option>
                  </select>
                </label>
                <button type="submit" disabled={listPending}>
                  {listPending ? "Recherche…" : "Rechercher"}
                </button>
              </form>

              <div className="player-management-list">
                {players.length ? players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={selectedPlayer?.id === player.id ? "is-selected" : undefined}
                    onClick={() => selectPlayer(player.id)}
                  >
                    <span>
                      <strong>{player.nickname}</strong>
                      <small>{player.publicCode} · {player.answerCount} réponse{player.answerCount === 1 ? "" : "s"}</small>
                    </span>
                    <span>
                      <b>{player.totalPoints.toLocaleString("fr-FR")} pts</b>
                      <i className={`player-status-chip player-status-chip--${player.status.toLowerCase()}`}>
                        {player.status === "ACTIVE" ? "Actif" : "Désactivé"}
                      </i>
                    </span>
                  </button>
                )) : (
                  <p className="player-management-empty">Aucun joueur ne correspond à ces critères.</p>
                )}
              </div>
            </section>

            <section
              className="player-management-detail"
              aria-busy={
                detailPending || disablePending || deletePending || adjustmentPending
              }
            >
              {!selectedPlayer ? (
                <div className="player-management-detail-empty">
                  <span aria-hidden="true">P</span>
                  <h2>{detailPending ? "Chargement…" : "Choisissez un joueur"}</h2>
                  <p>Sa fiche affichera le score, le code public et les réponses enregistrées.</p>
                </div>
              ) : (
                <>
                  <header className="player-detail-heading">
                    <div>
                      <p className="eyebrow">Fiche joueur</p>
                      <h2>{selectedPlayer.nickname}</h2>
                      <code>{selectedPlayer.publicCode}</code>
                    </div>
                    <i className={`player-status-chip player-status-chip--${selectedPlayer.status.toLowerCase()}`}>
                      {selectedPlayer.status === "ACTIVE" ? "Actif" : "Désactivé"}
                    </i>
                  </header>

                  <dl className="player-detail-stats">
                    <div><dt>Score</dt><dd>{selectedPlayer.totalPoints.toLocaleString("fr-FR")} pts</dd></div>
                    <div><dt>Série actuelle</dt><dd>{selectedPlayer.currentStreak}</dd></div>
                    <div><dt>Réponses</dt><dd>{selectedPlayer.answerCount}</dd></div>
                    <div><dt>Dernière activité</dt><dd>{formatDate(selectedPlayer.lastSeenAt)}</dd></div>
                  </dl>

                  <section className="player-score-adjustment">
                    <div className="player-score-adjustment-heading">
                      <div>
                        <p className="eyebrow">Correction exceptionnelle</p>
                        <h3>Ajuster le score</h3>
                      </div>
                      <span>Ledger</span>
                    </div>
                    {selectedPlayer.scoreSessions.some(
                      (session) => session.status !== "CANCELED",
                    ) ? (
                      <form onSubmit={adjustScore}>
                        <label>
                          <span>Session concernée</span>
                          <select
                            required
                            value={adjustmentForm.quizSessionId}
                            onChange={(event) =>
                              setAdjustmentForm((current) => ({
                                ...current,
                                quizSessionId: event.target.value,
                              }))
                            }
                          >
                            {selectedPlayer.scoreSessions.map((session) => (
                              <option
                                key={session.id}
                                value={session.id}
                                disabled={session.status === "CANCELED"}
                              >
                                {session.name} — {session.points.toLocaleString("fr-FR")} pts
                                {session.status === "CANCELED" ? " (annulée)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Points</span>
                          <input
                            required
                            type="number"
                            step="1"
                            inputMode="numeric"
                            value={adjustmentForm.points}
                            placeholder="Ex. 50 ou -50"
                            onChange={(event) =>
                              setAdjustmentForm((current) => ({
                                ...current,
                                points: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="player-score-adjustment-reason">
                          <span>Motif obligatoire</span>
                          <textarea
                            required
                            minLength={5}
                            maxLength={300}
                            value={adjustmentForm.reason}
                            placeholder="Décrivez précisément la correction validée."
                            onChange={(event) =>
                              setAdjustmentForm((current) => ({
                                ...current,
                                reason: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <p>
                          Le score existant ne sera pas écrasé. Une nouvelle ligne signée sera ajoutée au ledger.
                        </p>
                        <button type="submit" disabled={adjustmentPending}>
                          {adjustmentPending ? "Enregistrement…" : "Confirmer l’ajustement"}
                        </button>
                      </form>
                    ) : (
                      <p className="player-management-empty">
                        Aucune session disponible pour recevoir une correction.
                      </p>
                    )}

                    {selectedPlayer.scoreAdjustments.length ? (
                      <ol className="player-adjustment-history">
                        {selectedPlayer.scoreAdjustments.map((adjustment) => (
                          <li key={adjustment.id}>
                            <span>
                              <strong className={adjustment.points < 0 ? "is-negative" : undefined}>
                                {adjustment.points > 0 ? "+" : ""}
                                {adjustment.points.toLocaleString("fr-FR")} pts
                              </strong>
                              <small>{adjustment.sessionName}</small>
                            </span>
                            <p>{adjustment.reason}</p>
                            <small>
                              {adjustment.adminDisplayName} · {formatDate(adjustment.createdAt)}
                            </small>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </section>

                  {selectedPlayer.status === "ACTIVE" ? (
                    <div className="player-disable-panel">
                      <div>
                        <strong>Sécuriser l’accès</strong>
                        <p>Cette action est irréversible depuis la régie et déconnecte le joueur.</p>
                      </div>
                      <button type="button" disabled={disablePending} onClick={disablePlayer}>
                        {disablePending ? "Désactivation…" : "Désactiver le joueur"}
                      </button>
                    </div>
                  ) : null}

                  {selectedPlayer.event.environment === "TEST" &&
                  selectedPlayer.event.status !== "FINISHED" ? (
                    <div className="player-delete-panel">
                      <div>
                        <strong>Nettoyer un participant de test</strong>
                        <p>
                          Supprime définitivement sa participation, ses réponses,
                          son score, ses connexions et ses récompenses.
                        </p>
                      </div>
                      <button type="button" disabled={deletePending} onClick={deletePlayer}>
                        {deletePending ? "Suppression…" : "Supprimer le joueur test"}
                      </button>
                    </div>
                  ) : null}

                  <section className="player-answer-history">
                    <div>
                      <p className="eyebrow">Historique</p>
                      <h3>Réponses enregistrées</h3>
                    </div>
                    {selectedPlayer.answers.length ? (
                      <ol>
                        {selectedPlayer.answers.map((answer) => (
                          <li key={answer.id}>
                            <header>
                              <strong>{answer.sessionName} · Q{answer.questionPosition}</strong>
                              <span>{questionStatusLabels[answer.questionStatus]}</span>
                            </header>
                            <p>{answer.questionText}</p>
                            <dl>
                              <div>
                                <dt>Réponse choisie</dt>
                                <dd>{answer.selectedOptionLabel}. {answer.selectedOptionText}</dd>
                              </div>
                              <div>
                                <dt>Résultat</dt>
                                <dd>
                                  {answer.isCorrect === null
                                    ? "Masqué jusqu’à la révélation"
                                    : answer.isCorrect ? "Correcte" : "Incorrecte"}
                                </dd>
                              </div>
                              <div>
                                <dt>Temps</dt>
                                <dd>{formatResponseTime(answer.responseTimeMs)}</dd>
                              </div>
                              <div>
                                <dt>Reçue le</dt>
                                <dd>{formatDate(answer.receivedAt)}</dd>
                              </div>
                            </dl>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="player-management-empty">Aucune réponse enregistrée.</p>
                    )}
                  </section>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
