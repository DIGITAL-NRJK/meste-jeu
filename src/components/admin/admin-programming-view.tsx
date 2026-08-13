"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  localDateTimeToUtcIso,
  type TimeZoneOption,
  utcIsoToLocalDateTime,
} from "@/lib/date/timezone";
import type { AdminIdentity } from "@/server/services/admin-auth";
import type { AdminEventDetail } from "@/server/services/admin-programming";
import type {
  QuizSessionDetail,
  SessionQuestionDetail,
} from "@/server/services/session-engine";

export type AdminEventView = Omit<
  AdminEventDetail,
  "startsAt" | "endsAt" | "createdAt" | "updatedAt"
> & {
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
};

type AdminSessionQuestionView = Omit<
  SessionQuestionDetail,
  "opensAt" | "closesAt" | "revealedAt" | "canceledAt"
> & {
  opensAt: string | null;
  closesAt: string | null;
  revealedAt: string | null;
  canceledAt: string | null;
};

export type AdminSessionView = Omit<
  QuizSessionDetail,
  "startsAt" | "endsAt" | "createdAt" | "updatedAt" | "questions"
> & {
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  questions: AdminSessionQuestionView[];
};

export type AdminProgrammingQuestionView = {
  id: string;
  questionText: string;
  difficulty: number;
  category: { id: string; name: string };
};

type LineupItem = { questionId: string; durationSeconds: number };
type SessionFormState = {
  name: string;
  mode: "DISCOVERY" | "LIVE";
  startsAt: string;
  endsAt: string;
  resetScore: boolean;
};

type EventFormState = {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  environment: "TEST" | "PRODUCTION";
};

const statusLabels = {
  DRAFT: "Brouillon",
  READY: "Prête",
  LIVE: "En direct",
  FINISHED: "Terminée",
  CANCELED: "Annulée",
} as const;

const difficultyLabels = {
  1: "Découverte",
  2: "Intermédiaire",
  3: "Confirmée",
  4: "Expert",
} as const;

function eventFormDefaults(event?: AdminEventView): EventFormState {
  if (event) {
    return {
      name: event.name,
      description: event.description ?? "",
      startsAt: utcIsoToLocalDateTime(event.startsAt, event.timezone),
      endsAt: utcIsoToLocalDateTime(event.endsAt, event.timezone),
      timezone: event.timezone,
      environment: event.environment,
    };
  }

  return {
    name: "",
    description: "",
    startsAt: "",
    endsAt: "",
    timezone: "Africa/Brazzaville",
    environment: "PRODUCTION",
  };
}

const sessionFormDefaults: SessionFormState = {
  name: "",
  mode: "LIVE",
  startsAt: "",
  endsAt: "",
  resetScore: false,
};

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function lineupFromSession(session: AdminSessionView | undefined): LineupItem[] {
  return (
    session?.questions.map(({ questionId, durationSeconds }) => ({
      questionId,
      durationSeconds,
    })) ?? []
  );
}

async function responseError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  return new Error(payload.error?.message ?? "La commande a échoué.");
}

export function AdminProgrammingView({
  admin,
  initialEvents,
  initialEvent,
  initialSessions,
  timeZoneOptions,
  validatedQuestions,
}: {
  admin: AdminIdentity;
  initialEvents: AdminEventView[];
  initialEvent: AdminEventView | null;
  initialSessions: AdminSessionView[];
  timeZoneOptions: TimeZoneOption[];
  validatedQuestions: AdminProgrammingQuestionView[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [event, setEvent] = useState(initialEvent);
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedSessionId, setSelectedSessionId] = useState(
    initialSessions[0]?.id ?? "",
  );
  const [lineup, setLineup] = useState<LineupItem[]>(
    lineupFromSession(initialSessions[0]),
  );
  const [questionSearch, setQuestionSearch] = useState("");
  const [showEventForm, setShowEventForm] = useState(!initialEvent);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [eventForm, setEventForm] = useState(eventFormDefaults);
  const [sessionForm, setSessionForm] = useState<SessionFormState>(
    sessionFormDefaults,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedSession = sessions.find(
    ({ id }) => id === selectedSessionId,
  );
  const savedLineup = lineupFromSession(selectedSession);
  const lineupDirty = JSON.stringify(lineup) !== JSON.stringify(savedLineup);
  const selectedQuestionIds = new Set(lineup.map(({ questionId }) => questionId));
  const questionById = useMemo(
    () => new Map(validatedQuestions.map((question) => [question.id, question])),
    [validatedQuestions],
  );
  const normalizedSearch = questionSearch.trim().toLocaleLowerCase("fr-FR");
  const availableQuestions = validatedQuestions.filter(
    (question) =>
      !selectedQuestionIds.has(question.id) &&
      (!normalizedSearch ||
        `${question.questionText} ${question.category.name}`
          .toLocaleLowerCase("fr-FR")
          .includes(normalizedSearch)),
  );
  const hasReadySession = sessions.some(({ status }) => status === "READY");

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function handleUnauthorized(response: Response): boolean {
    if (response.status !== 401) return false;
    router.replace("/admin/login");
    router.refresh();
    return true;
  }

  async function saveEvent(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch(
        editingEventId
          ? `/api/admin/events/${editingEventId}`
          : "/api/admin/events",
        {
          method: editingEventId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...eventForm,
            startsAt: localDateTimeToUtcIso(
              eventForm.startsAt,
              eventForm.timezone,
            ),
            endsAt: localDateTimeToUtcIso(
              eventForm.endsAt,
              eventForm.timezone,
            ),
          }),
        },
      );
      if (handleUnauthorized(response)) return;
      if (!response.ok) throw await responseError(response);

      const payload = (await response.json()) as { event: AdminEventView };
      setEvents((current) =>
        editingEventId
          ? current.map((candidate) =>
              candidate.id === payload.event.id ? payload.event : candidate,
            )
          : [payload.event, ...current],
      );
      setEvent(payload.event);
      if (!editingEventId) {
        setSessions([]);
        setSelectedSessionId("");
        setLineup([]);
      }
      setEventForm(eventFormDefaults());
      setEditingEventId(null);
      setShowEventForm(false);
      setMessage(
        editingEventId
          ? "Événement mis à jour. Son lien joueur reste inchangé."
          : "Événement créé. Ajoutez maintenant sa première session.",
      );
      router.replace(`/admin/sessions?event=${encodeURIComponent(payload.event.slug)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    } finally {
      setPending(false);
    }
  }

  function openNewEventForm() {
    setEditingEventId(null);
    setEventForm(eventFormDefaults());
    setShowEventForm(true);
    setMessage(null);
  }

  function openEventEditor() {
    if (!event || event.status !== "DRAFT") return;
    setEditingEventId(event.id);
    setEventForm(eventFormDefaults(event));
    setShowEventForm(true);
    setMessage(null);
  }

  async function createSession(sessionSubmit: FormEvent<HTMLFormElement>) {
    sessionSubmit.preventDefault();
    if (!event) return;
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          name: sessionForm.name,
          mode: sessionForm.mode,
          startsAt: sessionForm.startsAt
            ? localDateTimeToUtcIso(sessionForm.startsAt, event.timezone)
            : null,
          endsAt: sessionForm.endsAt
            ? localDateTimeToUtcIso(sessionForm.endsAt, event.timezone)
            : null,
          resetScore: sessionForm.resetScore,
        }),
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) throw await responseError(response);

      const payload = (await response.json()) as { session: AdminSessionView };
      setSessions((current) => [payload.session, ...current]);
      setSelectedSessionId(payload.session.id);
      setLineup([]);
      setSessionForm(sessionFormDefaults);
      setShowSessionForm(false);
      setMessage("Session créée. Composez son conducteur avec les questions validées.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    } finally {
      setPending(false);
    }
  }

  function chooseSession(session: AdminSessionView) {
    setSelectedSessionId(session.id);
    setLineup(lineupFromSession(session));
    setMessage(null);
  }

  function moveLineupItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lineup.length) return;
    const next = [...lineup];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setLineup(next);
  }

  async function saveLineup() {
    if (!selectedSession) return;
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/sessions/${selectedSession.id}/lineup`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lineup),
        },
      );
      if (handleUnauthorized(response)) return;
      if (!response.ok) throw await responseError(response);

      const payload = (await response.json()) as { session: AdminSessionView };
      setSessions((current) =>
        current.map((candidate) =>
          candidate.id === payload.session.id ? payload.session : candidate,
        ),
      );
      setLineup(lineupFromSession(payload.session));
      setMessage("Conducteur enregistré dans l’ordre affiché.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setPending(false);
    }
  }

  async function markSessionReady() {
    if (!selectedSession) return;
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/live-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "MARK_READY",
          sessionId: selectedSession.id,
        }),
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) throw await responseError(response);

      const payload = (await response.json()) as { session: AdminSessionView };
      setSessions((current) =>
        current.map((candidate) =>
          candidate.id === payload.session.id ? payload.session : candidate,
        ),
      );
      setMessage("Session prête. Vous pouvez désormais ouvrir les inscriptions.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transition impossible.");
    } finally {
      setPending(false);
    }
  }

  async function runEventAction(
    action: "MARK_READY" | "RESET_DRAFT" | "FINISH",
  ) {
    if (!event) return;
    if (
      action === "RESET_DRAFT" &&
      !window.confirm(
        "Repasser cet événement en brouillon ? La question ouverte sera fermée, la session en direct sera remise en attente et tous les résultats seront conservés.",
      )
    ) {
      return;
    }
    if (
      action === "FINISH" &&
      !window.confirm(
        "Clôturer définitivement cet événement ? Les sessions non jouées seront annulées et aucun retour en brouillon ne sera possible.",
      )
    ) {
      return;
    }
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${event.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) throw await responseError(response);

      const payload = (await response.json()) as {
        event: AdminEventView;
        sessions: AdminSessionView[];
      };
      setEvent(payload.event);
      setSessions(payload.sessions);
      const refreshedSelected =
        payload.sessions.find(({ id }) => id === selectedSessionId) ??
        payload.sessions[0];
      setSelectedSessionId(refreshedSelected?.id ?? "");
      setLineup(lineupFromSession(refreshedSelected));
      setEvents((current) =>
        current.map((candidate) =>
          candidate.id === payload.event.id ? payload.event : candidate,
        ),
      );
      setMessage(
        action === "MARK_READY"
          ? "Inscriptions ouvertes : l’événement est prêt côté joueur."
          : action === "RESET_DRAFT"
            ? "Événement repassé en brouillon. Les résultats existants sont conservés."
            : "Événement clôturé définitivement.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transition impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin-page programming-page">
      <header className="admin-topbar">
        <Link href="/admin" className="admin-wordmark admin-wordmark-link">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span><strong>RÉGIE MESTE</strong><small>Programmation</small></span>
        </Link>
        <div className="admin-account">
          <span>{admin.displayName}</span>
          <button type="button" onClick={logout}>Se déconnecter</button>
        </div>
      </header>

      <div className="programming-shell">
        <section className="programming-hero">
          <div>
            <Link href="/admin" className="question-library-back">← Retour à la régie</Link>
            <p className="eyebrow">Plan de passage</p>
            <h1>Le conducteur</h1>
            <p>Créez l’événement, ordonnez ses questions et verrouillez la session avant le direct.</p>
          </div>
          <ol className="programming-steps" aria-label="Étapes de programmation">
            <li className={event ? "is-done" : "is-current"}><span>01</span> Événement</li>
            <li className={sessions.length ? "is-done" : event ? "is-current" : undefined}><span>02</span> Session</li>
            <li className={hasReadySession ? "is-done" : sessions.length ? "is-current" : undefined}><span>03</span> Conducteur</li>
            <li className={event?.status === "READY" ? "is-done" : hasReadySession ? "is-current" : undefined}><span>04</span> Inscriptions</li>
          </ol>
        </section>

        {message ? <p className="question-library-message" role="status">{message}</p> : null}

        <section className="programming-event-bar">
          {events.length ? (
            <label>
              <span>Événement</span>
              <select
                value={event?.slug ?? ""}
                onChange={(change) => {
                  router.push(`/admin/sessions?event=${encodeURIComponent(change.target.value)}`);
                }}
              >
                {events.map((candidate) => (
                  <option key={candidate.id} value={candidate.slug}>
                    {candidate.environment === "TEST" ? "[TEST] " : ""}
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          ) : <strong>Aucun événement programmé</strong>}
          <div className="programming-event-actions">
            {event ? (
              <>
                <span className={`admin-environment admin-environment--${event.environment.toLowerCase()}`}>
                  {event.environment === "TEST" ? "Test" : "Production"}
                </span>
                <span className={`admin-status admin-status--${event.status.toLowerCase()}`}>{statusLabels[event.status]}</span>
              </>
            ) : null}
            {event?.status === "DRAFT" ? (
              <button type="button" disabled={pending || !hasReadySession} onClick={() => runEventAction("MARK_READY")}>
                Ouvrir les inscriptions
              </button>
            ) : null}
            {event?.status === "DRAFT" ? (
              <button type="button" className="programming-secondary-action" onClick={openEventEditor}>
                Modifier
              </button>
            ) : null}
            {event && event.status !== "DRAFT" && event.status !== "FINISHED" ? (
              <button type="button" className="programming-secondary-action" disabled={pending} onClick={() => runEventAction("RESET_DRAFT")}>
                Repasser en brouillon
              </button>
            ) : null}
            {event && event.status !== "FINISHED" ? (
              <button type="button" className="programming-danger-action" disabled={pending} onClick={() => runEventAction("FINISH")}>
                Clôturer
              </button>
            ) : null}
            <button type="button" className="programming-secondary-action" onClick={openNewEventForm}>
              Nouvel événement
            </button>
          </div>
        </section>

        {showEventForm ? (
          <form className="programming-creation-form" onSubmit={saveEvent}>
            <header><p className="eyebrow">Cadre</p><h2>{editingEventId ? "Modifier l’événement" : "Créer un événement"}</h2></header>
            <label><span>Nom</span><input required minLength={3} maxLength={150} value={eventForm.name} onChange={(change) => setEventForm({ ...eventForm, name: change.target.value })} /></label>
            <label className="programming-wide"><span>Description</span><textarea rows={2} maxLength={1000} value={eventForm.description} onChange={(change) => setEventForm({ ...eventForm, description: change.target.value })} /></label>
            <label><span>Début</span><input required type="datetime-local" value={eventForm.startsAt} onChange={(change) => setEventForm({ ...eventForm, startsAt: change.target.value })} /></label>
            <label><span>Fin</span><input required type="datetime-local" value={eventForm.endsAt} onChange={(change) => setEventForm({ ...eventForm, endsAt: change.target.value })} /></label>
            <label><span>Fuseau horaire</span><select required value={eventForm.timezone} onChange={(change) => setEventForm({ ...eventForm, timezone: change.target.value })}>{timeZoneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label><span>Contexte</span><select required value={eventForm.environment} onChange={(change) => setEventForm({ ...eventForm, environment: change.target.value as "TEST" | "PRODUCTION" })}><option value="PRODUCTION">Production — joueurs conservés</option><option value="TEST">Test — joueurs supprimables</option></select></label>
            <p className="programming-wide programming-form-help">Le contexte peut être modifié uniquement en brouillon. En production, un joueur peut être désactivé mais jamais supprimé.</p>
            <div className="programming-form-actions">
              <button type="submit" disabled={pending}>{pending ? "Enregistrement…" : editingEventId ? "Enregistrer" : "Créer l’événement"}</button>
              <button type="button" className="programming-secondary-action" onClick={() => { setShowEventForm(false); setEditingEventId(null); setEventForm(eventFormDefaults()); }}>Annuler</button>
            </div>
          </form>
        ) : null}

        {event ? (
          <>
            <section className="programming-event-summary">
              <div><small>Fenêtre événement</small><strong>{formatDate(event.startsAt, event.timezone)} → {formatDate(event.endsAt, event.timezone)}</strong></div>
              <div><small>Fuseau</small><strong>{event.timezone}</strong></div>
              <div><small>Contexte</small><strong>{event.environment === "TEST" ? "Test — joueurs supprimables" : "Production — joueurs conservés"}</strong></div>
              <div><small>Accès joueur</small><strong>{event.status === "READY" || event.status === "LIVE" ? "Inscriptions ouvertes" : "Fermé pendant la préparation"}</strong></div>
            </section>

            {showSessionForm && event.status === "DRAFT" ? (
              <form className="programming-creation-form" onSubmit={createSession}>
                <header><p className="eyebrow">Séquence</p><h2>Nouvelle session</h2></header>
                <label><span>Nom</span><input required minLength={3} maxLength={150} value={sessionForm.name} onChange={(change) => setSessionForm({ ...sessionForm, name: change.target.value })} /></label>
                <label><span>Mode</span><select value={sessionForm.mode} onChange={(change) => setSessionForm({ ...sessionForm, mode: change.target.value as "DISCOVERY" | "LIVE" })}><option value="LIVE">Quiz live</option><option value="DISCOVERY">Découverte</option></select></label>
                <label><span>Début prévu (optionnel)</span><input type="datetime-local" value={sessionForm.startsAt} onChange={(change) => setSessionForm({ ...sessionForm, startsAt: change.target.value })} /></label>
                <label><span>Fin prévue (optionnel)</span><input type="datetime-local" value={sessionForm.endsAt} onChange={(change) => setSessionForm({ ...sessionForm, endsAt: change.target.value })} /></label>
                <label className="programming-checkbox"><input type="checkbox" checked={sessionForm.resetScore} onChange={(change) => setSessionForm({ ...sessionForm, resetScore: change.target.checked })} /><span>Remettre le score à zéro au début</span></label>
                <button type="submit" disabled={pending}>{pending ? "Création…" : "Créer la session"}</button>
              </form>
            ) : null}

            <div className="programming-workspace">
              <aside className="programming-session-index">
                <div className="programming-section-heading">
                  <div><p className="eyebrow">Sessions</p><h2>{sessions.length} séquence{sessions.length > 1 ? "s" : ""}</h2></div>
                  {event.status === "DRAFT" ? <button type="button" onClick={() => setShowSessionForm((open) => !open)}>{showSessionForm ? "Fermer" : "Nouvelle"}</button> : null}
                </div>
                <div className="programming-session-list">
                  {sessions.length ? sessions.map((session) => (
                    <button key={session.id} type="button" className={session.id === selectedSessionId ? "is-selected" : undefined} onClick={() => chooseSession(session)}>
                      <span className={`admin-status admin-status--${session.status.toLowerCase()}`}>{statusLabels[session.status]}</span>
                      <strong>{session.name}</strong>
                      <small>{session.mode === "LIVE" ? "Live" : "Découverte"} · {session.questions.length} question{session.questions.length > 1 ? "s" : ""}</small>
                    </button>
                  )) : <div className="programming-empty"><strong>Première séquence à créer</strong><p>Une session rassemble les questions qui seront jouées dans l’ordre.</p>{event.status === "DRAFT" ? <button type="button" onClick={() => setShowSessionForm(true)}>Créer une session</button> : null}</div>}
                </div>
              </aside>

              <section className="programming-editor" aria-busy={pending}>
                {selectedSession ? (
                  <>
                    <header className="programming-editor-heading">
                      <div><p className="eyebrow">Conducteur de session</p><h2>{selectedSession.name}</h2><small>{selectedSession.resetScore ? "Remise à zéro du score" : "Score cumulé"}</small></div>
                      <span className={`admin-status admin-status--${selectedSession.status.toLowerCase()}`}>{statusLabels[selectedSession.status]}</span>
                    </header>

                    {selectedSession.status === "DRAFT" ? (
                      <div className="programming-lineup-layout">
                        <section className="programming-question-bank">
                          <header><div><p className="eyebrow">Réserve validée</p><h3>{availableQuestions.length} disponibles</h3></div></header>
                          <label><span>Rechercher</span><input type="search" placeholder="Question ou catégorie…" value={questionSearch} onChange={(change) => setQuestionSearch(change.target.value)} /></label>
                          <div className="programming-question-list">
                            {availableQuestions.length ? availableQuestions.map((question) => (
                              <button key={question.id} type="button" onClick={() => setLineup((current) => [...current, { questionId: question.id, durationSeconds: 30 }])}>
                                <span>+</span><strong>{question.questionText}</strong><small>{question.category.name} · {difficultyLabels[question.difficulty as keyof typeof difficultyLabels]}</small>
                              </button>
                            )) : <div className="programming-empty"><strong>{validatedQuestions.length ? "Toutes les questions sont placées" : "Aucune question validée"}</strong><p>{validatedQuestions.length ? "Retirez une question du conducteur pour la rendre disponible." : "Validez d’abord une fiche dans la bibliothèque."}</p>{!validatedQuestions.length ? <Link href="/admin/questions">Ouvrir la bibliothèque →</Link> : null}</div>}
                          </div>
                        </section>

                        <section className="programming-lineup">
                          <header><div><p className="eyebrow">Ordre de passage</p><h3>{lineup.length} question{lineup.length > 1 ? "s" : ""}</h3></div><strong>{lineup.reduce((total, item) => total + item.durationSeconds, 0)} s</strong></header>
                          <ol>
                            {lineup.length ? lineup.map((item, index) => {
                              const question = questionById.get(item.questionId);
                              const stored = selectedSession.questions.find(({ questionId }) => questionId === item.questionId);
                              return (
                                <li key={item.questionId}>
                                  <span className="programming-position">{String(index + 1).padStart(2, "0")}</span>
                                  <div><strong>{question?.questionText ?? stored?.questionText ?? "Question indisponible"}</strong><small>{question?.category.name ?? "Question déjà programmée"}</small></div>
                                  <label><span>Durée</span><input aria-label={`Durée de la question ${index + 1}`} type="number" min={1} max={3600} value={item.durationSeconds} onChange={(change) => setLineup((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, durationSeconds: Number(change.target.value) } : candidate))} /></label>
                                  <div className="programming-order-actions"><button type="button" aria-label={`Monter la question ${index + 1}`} disabled={index === 0} onClick={() => moveLineupItem(index, -1)}>↑</button><button type="button" aria-label={`Descendre la question ${index + 1}`} disabled={index === lineup.length - 1} onClick={() => moveLineupItem(index, 1)}>↓</button><button type="button" aria-label={`Retirer la question ${index + 1}`} onClick={() => setLineup((current) => current.filter((_, candidateIndex) => candidateIndex !== index))}>×</button></div>
                                </li>
                              );
                            }) : <li className="programming-empty"><strong>Conducteur vide</strong><p>Ajoutez des questions depuis la réserve validée.</p></li>}
                          </ol>
                          <footer><button type="button" className="programming-secondary-action" disabled={pending || !lineupDirty} onClick={saveLineup}>Enregistrer l’ordre</button><button type="button" disabled={pending || lineup.length === 0 || lineupDirty} onClick={markSessionReady}>Verrouiller et rendre prête</button></footer>
                          {lineupDirty ? <p className="programming-unsaved">Enregistrez le conducteur avant de rendre la session prête.</p> : null}
                        </section>
                      </div>
                    ) : (
                      <div className="programming-locked-lineup">
                        <p>Le conducteur est verrouillé pour garantir l’ordre du direct.</p>
                        <ol>{selectedSession.questions.map((question) => <li key={question.id}><span>{String(question.position).padStart(2, "0")}</span><strong>{question.questionText}</strong><small>{question.durationSeconds} s</small></li>)}</ol>
                        <Link href={`/admin?event=${encodeURIComponent(event.slug)}`}>Revenir à la conduite live →</Link>
                      </div>
                    )}
                  </>
                ) : <div className="programming-empty programming-editor-empty"><span aria-hidden="true">→</span><h2>Créez une session</h2><p>Elle apparaîtra ici sous la forme d’un conducteur ordonné.</p><button type="button" onClick={() => setShowSessionForm(true)}>Nouvelle session</button></div>}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
