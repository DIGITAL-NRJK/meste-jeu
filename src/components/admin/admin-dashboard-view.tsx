"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminIdentity } from "@/server/services/admin-auth";
import type { AdminDashboard } from "@/server/services/admin-dashboard";
import type {
  AdminAuditLogEntry,
  AdminExportKind,
} from "@/server/services/admin-reporting";
import type { AdminLiveControlInput } from "@/lib/validation/admin-live-control";
import { getLiveControlActions } from "@/lib/game/admin-live-controls";

const statusLabels = {
  DRAFT: "Brouillon",
  READY: "Prête",
  LIVE: "En direct",
  FINISHED: "Terminée",
  CANCELED: "Annulée",
  PENDING: "À venir",
  OPEN: "Ouverte",
  CLOSED: "Fermée",
  REVEALED: "Révélée",
} as const;

const auditActionLabels: Record<AdminAuditLogEntry["action"], string> = {
  QUESTION_CREATED: "Question créée",
  QUESTION_UPDATED: "Question modifiée",
  QUESTION_VALIDATED: "Question validée",
  SESSION_CREATED: "Session créée",
  SESSION_STARTED: "Session lancée",
  SESSION_FINISHED: "Session terminée",
  QUESTION_STARTED: "Question lancée",
  QUESTION_CLOSED: "Réponses fermées",
  QUESTION_REVEALED: "Réponse révélée",
  QUESTION_CANCELED: "Question annulée",
  SCORE_ADJUSTED: "Score ajusté",
  PLAYER_DISABLED: "Joueur désactivé",
  REWARD_AWARDED: "Récompense attribuée",
  EVENT_UPDATED: "Événement modifié",
  EVENT_RESET_DRAFT: "Événement repassé en brouillon",
  EVENT_FINISHED: "Événement clôturé",
  PLAYER_DELETED: "Joueur de test supprimé",
  ADMIN_USER_CREATED: "Administrateur créé",
  ADMIN_USER_DISABLED: "Administrateur désactivé",
  ADMIN_USER_REACTIVATED: "Administrateur réactivé",
};

const exportLabels: Record<AdminExportKind, string> = {
  players: "Exporter les joueurs",
  leaderboard: "Exporter le classement",
  answers: "Exporter les réponses",
};

function statusLabel(status: keyof typeof statusLabels) {
  return statusLabels[status];
}

function pollingDelay() {
  return 5_000 + Math.floor(Math.random() * 2_001);
}

function formatResponseTime(value: number | null) {
  if (value === null) return "—";
  return `${(value / 1_000).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} s`;
}

function remainingTime(closesAt: string | null, serverTime: number) {
  if (!closesAt) return "—";
  const seconds = Math.max(0, Math.ceil((Date.parse(closesAt) - serverTime) / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, "0")}` : `${seconds} s`;
}

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function AdminDashboardView({
  admin,
  initialAuditLogs,
  initialDashboard,
}: {
  admin: AdminIdentity;
  initialAuditLogs: AdminAuditLogEntry[];
  initialDashboard: AdminDashboard;
}) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedEvent, setSelectedEvent] = useState(
    initialDashboard.event?.slug ?? "",
  );
  const [stale, setStale] = useState(false);
  const [commandPending, setCommandPending] = useState(false);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);
  const [exportPending, setExportPending] = useState<AdminExportKind | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    const controller = new AbortController();

    async function refresh() {
      const query = selectedEvent
        ? `?eventSlug=${encodeURIComponent(selectedEvent)}`
        : "";

      try {
        const response = await fetch(`/api/admin/dashboard${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401) {
          router.replace("/admin/login");
          router.refresh();
          return;
        }

        if (!response.ok) throw new Error("Dashboard refresh failed");
        const nextDashboard = (await response.json()) as AdminDashboard;

        if (active) {
          setDashboard(nextDashboard);
          setStale(false);
        }
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) {
          setStale(true);
        }
      } finally {
        if (active) timeout = window.setTimeout(refresh, pollingDelay());
      }
    }

    timeout = window.setTimeout(refresh, pollingDelay());
    return () => {
      active = false;
      controller.abort();
      if (timeout) window.clearTimeout(timeout);
    };
  }, [router, selectedEvent]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function selectEvent(slug: string) {
    setSelectedEvent(slug);
    router.replace(slug ? `/admin?event=${encodeURIComponent(slug)}` : "/admin", {
      scroll: false,
    });
  }

  async function refreshAuditLogs() {
    try {
      const response = await fetch("/api/admin/audit-logs?limit=30", {
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) return;

      const payload = (await response.json()) as {
        auditLogs: AdminAuditLogEntry[];
      };
      setAuditLogs(payload.auditLogs);
    } catch {
      // La commande live reste valide même si le rafraîchissement d’audit échoue.
    }
  }

  async function downloadExport(kind: AdminExportKind) {
    if (!selectedEvent) return;

    setExportPending(kind);
    setExportMessage(null);
    try {
      const response = await fetch(
        `/api/admin/exports/${kind}?eventSlug=${encodeURIComponent(selectedEvent)}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Export indisponible.");
      }

      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/u)?.[1] ?? `${kind}.csv`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMessage(`${exportLabels[kind]} : fichier généré.`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export indisponible.");
    } finally {
      setExportPending(null);
    }
  }

  async function runCommand(action: AdminLiveControlInput["action"], label: string) {
    if (!dashboard.session || !window.confirm(`Confirmer : ${label.toLowerCase()} ?`)) return;
    setCommandPending(true);
    setCommandMessage(null);
    try {
      const response = await fetch("/api/admin/live-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId: dashboard.session.id, sessionQuestionId: dashboard.currentQuestion?.id }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error(payload.error?.message ?? "Commande refusée.");
      const query = selectedEvent ? `?eventSlug=${encodeURIComponent(selectedEvent)}` : "";
      const refreshed = await fetch(`/api/admin/dashboard${query}`, { cache: "no-store" });
      if (refreshed.ok) setDashboard((await refreshed.json()) as AdminDashboard);
      await refreshAuditLogs();
      setCommandMessage(`${label} : terminé.`);
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : "Commande refusée.");
    } finally {
      setCommandPending(false);
    }
  }

  const question = dashboard.currentQuestion;
  const serverTime = Date.parse(dashboard.serverNow);
  const liveActions = dashboard.session
    ? getLiveControlActions(dashboard.session.status, question?.status ?? null)
    : [];
  const eventQuery = selectedEvent
    ? `?event=${encodeURIComponent(selectedEvent)}`
    : "";
  const responseProgress = question && dashboard.participants.registered > 0
    ? Math.min(
        100,
        Math.round(
          (question.answersReceived / dashboard.participants.registered) * 100,
        ),
      )
    : 0;
  const timerProgress = question?.closesAt
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ((Date.parse(question.closesAt) - serverTime) /
              (question.durationSeconds * 1_000)) *
              100,
          ),
        ),
      )
    : 0;

  return (
    <main className="regie-shell">
      <a className="regie-skip-link" href="#regie-content">
        Aller au contenu
      </a>

      <aside className="regie-sidebar">
        <a className="regie-brand" href="/admin" aria-label="Régie MESTE — accueil">
          <span className="regie-brand-mark" aria-hidden="true">M</span>
          <span>
            <strong>RÉGIE MESTE</strong>
            <small>Héritage Congo</small>
          </span>
        </a>

        <nav className="regie-navigation" aria-label="Navigation de la régie">
          <a className="is-active" href="/admin" aria-current="page">
            <span aria-hidden="true">01</span> Vue de la salle
          </a>
          <a href="/admin/sessions"><span aria-hidden="true">02</span> Conducteur</a>
          <a href="/admin/questions"><span aria-hidden="true">03</span> Questions</a>
          <a href={`/admin/players${eventQuery}`}><span aria-hidden="true">04</span> Joueurs</a>
          <a href={`/admin/rewards${eventQuery}`}><span aria-hidden="true">05</span> Lots</a>
          <a href="/admin/accounts"><span aria-hidden="true">06</span> Accès</a>
          {selectedEvent ? (
            <a
              className="regie-player-entry"
              href={`/play/${encodeURIComponent(selectedEvent)}`}
              target="_blank"
              rel="noreferrer"
            >
              <span aria-hidden="true">↗</span> Espace joueur
            </a>
          ) : null}
        </nav>

        <div className="regie-sidebar-live">
          <div>
            <span className={stale ? "is-stale" : undefined} aria-hidden="true" />
            <p>{stale ? "Synchronisation interrompue" : "Régie synchronisée"}</p>
          </div>
          <strong>{dashboard.event?.name ?? "Aucun événement sélectionné"}</strong>
          <small>
            {dashboard.session
              ? `${dashboard.session.name} · ${dashboard.session.questionCount} questions`
              : "Programmation en attente"}
          </small>
        </div>
      </aside>

      <section className="regie-workspace">
        <header className="regie-toolbar">
          {dashboard.events.length ? (
            <label className="regie-event-select">
              <span>Événement supervisé</span>
              <select
                value={selectedEvent}
                onChange={(event) => selectEvent(event.target.value)}
              >
                {dashboard.events.map((event) => (
                  <option key={event.id} value={event.slug}>
                    {event.environment === "TEST" ? "[TEST] " : ""}{event.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="regie-toolbar-label">Aucun événement programmé</p>
          )}

          <div className="regie-account">
            <span className="regie-account-avatar" aria-hidden="true">
              {admin.displayName.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{admin.displayName}</strong>
              <a href="/admin/accounts">Gérer les accès</a>
            </span>
            <button type="button" onClick={logout}>Se déconnecter</button>
          </div>
        </header>

        <div className="regie-dashboard" id="regie-content">
          <header className="regie-page-heading">
            <div>
              <p className="regie-kicker">Table de supervision</p>
              <h1>Vue de la salle</h1>
              <p>Conduisez la session et suivez la participation en temps réel.</p>
            </div>
            {dashboard.event ? (
              <div className="regie-context-badges" aria-label="Contexte de l’événement">
                <span className={`admin-status admin-status--${dashboard.event.status.toLowerCase()}`}>
                  {statusLabel(dashboard.event.status)}
                </span>
                <span className={`admin-environment admin-environment--${dashboard.event.environment.toLowerCase()}`}>
                  {dashboard.event.environment === "TEST" ? "Mode test" : "Production"}
                </span>
              </div>
            ) : null}
          </header>

          {stale ? (
            <p className="regie-alert" role="status">
              Actualisation interrompue. Les dernières données reçues restent affichées.
            </p>
          ) : null}

          {!dashboard.event ? (
            <section className="regie-empty-state">
              <span className="regie-empty-mark" aria-hidden="true">M</span>
              <p className="regie-kicker">Aucun événement</p>
              <h2>La régie attend sa première programmation.</h2>
              <p>Créez l’événement, ses sessions et leurs conducteurs avant d’ouvrir la supervision.</p>
              <a href="/admin/sessions">Créer la première programmation</a>
            </section>
          ) : (
            <>
              <section
                className="regie-live-card"
                id="question"
                aria-labelledby="regie-live-title"
                aria-busy={commandPending}
              >
                <div className="regie-live-main">
                  <div className="regie-live-meta">
                    <span className="regie-live-dot" aria-hidden="true" />
                    <span>{dashboard.session ? statusLabel(dashboard.session.status) : "Programmation"}</span>
                    <span aria-hidden="true">•</span>
                    <span>
                      {dashboard.session
                        ? `${dashboard.session.name} · ${dashboard.session.questionCount} questions`
                        : "Aucune session sélectionnée"}
                    </span>
                  </div>

                  <div className="regie-question-copy">
                    <p className="regie-kicker">
                      {question ? `Question ${question.position}` : "Action suivante"}
                    </p>
                    <h2 id="regie-live-title">
                      {question?.questionText ?? "Préparez une session pour commencer la partie."}
                    </h2>
                    {question ? (
                      <div className="regie-response-progress">
                        <span>
                          <strong>{question.answersReceived}</strong> réponse{question.answersReceived > 1 ? "s" : ""}
                          {dashboard.participants.registered
                            ? ` sur ${dashboard.participants.registered} inscrits`
                            : ""}
                        </span>
                        <progress
                          aria-label="Progression des réponses reçues"
                          max={100}
                          value={responseProgress}
                        />
                      </div>
                    ) : (
                      <p className="regie-live-helper">
                        Sélectionnez ou préparez le conducteur depuis la programmation.
                      </p>
                    )}
                  </div>

                  {dashboard.session && dashboard.session.status !== "FINISHED" ? (
                    <div className="regie-live-controls">
                      <div className="regie-control-actions">
                        {liveActions.map((control) => (
                          <button
                            key={control.action}
                            type="button"
                            className={control.danger ? "is-danger" : undefined}
                            disabled={commandPending}
                            onClick={() => runCommand(control.action, control.label)}
                          >
                            {control.label}
                          </button>
                        ))}
                      </div>
                      {commandMessage ? <p role="status">{commandMessage}</p> : null}
                    </div>
                  ) : null}
                </div>

                <aside className="regie-timer" aria-label="Minuterie de la question">
                  <p>Temps restant</p>
                  <strong>{remainingTime(question?.closesAt ?? null, serverTime)}</strong>
                  <progress
                    aria-label="Temps restant pour répondre"
                    max={100}
                    value={timerProgress}
                  />
                  <small>
                    {question
                      ? `${question.durationSeconds} secondes prévues`
                      : "La minuterie apparaîtra au lancement"}
                  </small>
                </aside>
              </section>

              <section className="regie-metrics" aria-label="Indicateurs de la salle">
                <article>
                  <span className="regie-metric-index" aria-hidden="true">01</span>
                  <p>Participants</p>
                  <strong>{dashboard.participants.registered}</strong>
                  <small>{dashboard.participants.activeRecently} actifs sur les 15 dernières minutes</small>
                  <a href={`/admin/players${eventQuery}`}>Gérer les joueurs</a>
                </article>
                <article>
                  <span className="regie-metric-index" aria-hidden="true">02</span>
                  <p>Réponses reçues</p>
                  <strong>{question?.answersReceived ?? 0}</strong>
                  <small>{question ? `${responseProgress} % des inscrits` : "Aucune question en cours"}</small>
                  <a href="#question">Voir la question</a>
                </article>
                <article>
                  <span className="regie-metric-index" aria-hidden="true">03</span>
                  <p>Taux de réussite</p>
                  <strong>{question ? `${question.successRate} %` : "—"}</strong>
                  <small>{question ? `${question.correctAnswers} réponses correctes` : "Résultat en attente"}</small>
                  <a href="#classement">Voir le classement</a>
                </article>
                <article>
                  <span className="regie-metric-index" aria-hidden="true">04</span>
                  <p>Temps moyen</p>
                  <strong>{formatResponseTime(question?.averageResponseTimeMs ?? null)}</strong>
                  <small>{question ? `sur ${question.durationSeconds} secondes` : "Mesure indisponible"}</small>
                  <a href="#audit">Consulter l’audit</a>
                </article>
              </section>

              <div className="regie-content-grid">
                <section className="regie-panel regie-ranking" id="classement">
                  <div className="regie-panel-heading">
                    <div>
                      <p className="regie-kicker">Classement live</p>
                      <h2>Les dix premières places</h2>
                    </div>
                    <span className="regie-panel-count">Top 10</span>
                  </div>
                  {dashboard.leaderboard.length ? (
                    <ol className="regie-ranking-list">
                      {dashboard.leaderboard.map((entry) => (
                        <li key={entry.publicCode}>
                          <span className="regie-rank">{String(entry.position).padStart(2, "0")}</span>
                          <span>
                            <strong>{entry.nickname}</strong>
                            <small>{entry.publicCode}</small>
                          </span>
                          <strong>{entry.points.toLocaleString("fr-FR")} pts</strong>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="regie-panel-empty">
                      Le classement se remplira avec les premières participations.
                    </p>
                  )}
                </section>

                <div className="regie-utilities">
                  <section className="regie-panel" id="bibliotheque">
                    <div className="regie-panel-heading">
                      <div>
                        <p className="regie-kicker">Bibliothèque</p>
                        <h2>Questions</h2>
                      </div>
                      <span className="regie-panel-count">{dashboard.questionLibrary.total}</span>
                    </div>
                    <dl className="regie-library-breakdown">
                      <div><dt>Brouillons</dt><dd>{dashboard.questionLibrary.drafts}</dd></div>
                      <div><dt>En revue</dt><dd>{dashboard.questionLibrary.inReview}</dd></div>
                      <div><dt>Validées</dt><dd>{dashboard.questionLibrary.validated}</dd></div>
                    </dl>
                    <a className="regie-text-link" href="/admin/questions">
                      Gérer les questions et catégories
                    </a>
                  </section>

                  <section className="regie-panel" id="exports">
                    <div className="regie-panel-heading">
                      <div>
                        <p className="regie-kicker">Données</p>
                        <h2>Exports CSV</h2>
                      </div>
                      <span className="regie-panel-count">CSV</span>
                    </div>
                    <div className="regie-export-actions">
                      {(Object.keys(exportLabels) as AdminExportKind[]).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          disabled={exportPending !== null}
                          onClick={() => downloadExport(kind)}
                        >
                          {exportPending === kind ? "Génération…" : exportLabels[kind]}
                        </button>
                      ))}
                    </div>
                    {exportMessage ? <p className="regie-export-message" role="status">{exportMessage}</p> : null}
                  </section>
                </div>

                <section className="regie-panel regie-audit" id="audit">
                  <div className="regie-panel-heading">
                    <div>
                      <p className="regie-kicker">Traçabilité</p>
                      <h2>Journal administrateur</h2>
                    </div>
                    <span className="regie-panel-count" data-testid="audit-count">{auditLogs.length}</span>
                  </div>
                  {auditLogs.length ? (
                    <ol className="regie-audit-list" aria-label="Journal des dernières actions administratives">
                      {auditLogs.map((entry) => (
                        <li key={entry.id}>
                          <span className="regie-audit-marker" aria-hidden="true" />
                          <span>
                            <strong>{auditActionLabels[entry.action]}</strong>
                            <small>
                              {entry.adminDisplayName} · {entry.entityType}
                              {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}
                            </small>
                          </span>
                          <time dateTime={entry.createdAt}>{formatAuditTime(entry.createdAt)}</time>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="regie-panel-empty">Aucune action administrative journalisée.</p>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
