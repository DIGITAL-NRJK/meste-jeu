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

  return (
    <main className="admin-page">
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

      <div className="admin-dashboard">
        <section className="admin-dashboard-intro">
          <div>
            <p className="eyebrow">Table de supervision</p>
            <h1>Vue de la salle</h1>
          </div>
          {dashboard.events.length ? (
            <label className="admin-event-select">
              <span>Événement</span>
              <select
                value={selectedEvent}
                onChange={(event) => selectEvent(event.target.value)}
              >
                {dashboard.events.map((event) => (
                  <option key={event.id} value={event.slug}>{event.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        {stale ? (
          <p className="admin-stale" role="status">
            Actualisation interrompue. Les dernières données restent affichées.
          </p>
        ) : null}

        {!dashboard.event ? (
          <section className="admin-empty-state">
            <p className="eyebrow">Aucun événement</p>
            <h2>La régie attend sa première programmation.</h2>
            <p>Créez l’événement, sa session et son conducteur avant d’ouvrir la supervision.</p>
            <a href="/admin/sessions">Créer la première programmation →</a>
          </section>
        ) : (
          <>
            <section className="admin-live-line" aria-label="État de la session">
              <div className="admin-live-line-track" aria-hidden="true" />
              <div className="admin-live-line-event">
                <span className={`admin-status admin-status--${dashboard.event.status.toLowerCase()}`}>
                  {statusLabel(dashboard.event.status)}
                </span>
                <small>Événement</small>
                <strong>{dashboard.event.name}</strong>
              </div>
              <div className="admin-live-line-session">
                <small>Session actuelle</small>
                <strong>{dashboard.session?.name ?? "Aucune session"}</strong>
                <span>
                  {dashboard.session
                    ? `${statusLabel(dashboard.session.status)} · ${dashboard.session.questionCount} questions`
                    : "En attente de programmation"}
                </span>
              </div>
              <div className="admin-live-line-time">
                <small>Temps restant</small>
                <strong>{remainingTime(question?.closesAt ?? null, serverTime)}</strong>
              </div>
            </section>

            {dashboard.session && dashboard.session.status !== "FINISHED" ? (
              <section
                className="admin-control-deck"
                aria-busy={commandPending}
                aria-labelledby="live-controls-title"
              >
                <div>
                  <p className="eyebrow">Conduite live</p>
                  <h2 id="live-controls-title">Action suivante</h2>
                  {commandMessage ? <p role="status">{commandMessage}</p> : null}
                </div>
                <div className="admin-control-actions">
                  {liveActions.map((control) => (
                    <button
                      key={control.action}
                      type="button"
                      className={control.danger ? "admin-control-danger" : undefined}
                      disabled={commandPending}
                      onClick={() => runCommand(control.action, control.label)}
                    >
                      {control.label}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <nav className="admin-shortcuts" aria-label="Accès rapides">
              <a href={`/admin/players?event=${encodeURIComponent(selectedEvent)}`}>Joueurs</a>
              <a href="#question">Question actuelle</a>
              <a href="#classement">Classement</a>
              <a href="/admin/sessions">Programmation</a>
              <a href="/admin/questions">Questions</a>
              <a href={`/admin/rewards?event=${encodeURIComponent(selectedEvent)}`}>Lots</a>
              <a href="#exports">Exports</a>
              <a href="#audit">Audit</a>
            </nav>

            <div className="admin-grid">
              <section className="admin-panel admin-participants" id="participants">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">Participants</p>
                    <h2>Présence</h2>
                  </div>
                  <span className="admin-panel-index">P</span>
                </div>
                <div className="admin-presence-numbers">
                  <div>
                    <strong>{dashboard.participants.registered}</strong>
                    <span>inscrits</span>
                  </div>
                  <div>
                    <strong>{dashboard.participants.activeRecently}</strong>
                    <span>actifs · 15 min</span>
                  </div>
                </div>
                <a
                  className="admin-library-link"
                  href={`/admin/players?event=${encodeURIComponent(selectedEvent)}`}
                >
                  Rechercher et gérer les joueurs →
                </a>
              </section>

              <section className="admin-panel admin-question" id="question">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">Question actuelle</p>
                    <h2>{question ? `Question ${question.position}` : "En attente"}</h2>
                  </div>
                  {question ? (
                    <span className={`admin-status admin-status--${question.status.toLowerCase()}`}>
                      {statusLabel(question.status)}
                    </span>
                  ) : null}
                </div>
                {question ? (
                  <>
                    <p className="admin-question-copy">{question.questionText}</p>
                    <dl className="admin-question-stats">
                      <div><dt>Réponses</dt><dd>{question.answersReceived}</dd></div>
                      <div><dt>Correctes</dt><dd>{question.correctAnswers}</dd></div>
                      <div><dt>Réussite</dt><dd>{question.successRate} %</dd></div>
                      <div><dt>Temps moyen</dt><dd>{formatResponseTime(question.averageResponseTimeMs)}</dd></div>
                    </dl>
                  </>
                ) : (
                  <p className="admin-panel-empty">Aucune question n’est positionnée dans la session courante.</p>
                )}
              </section>

              <section className="admin-panel admin-ranking" id="classement">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">Classement</p>
                    <h2>Top 10</h2>
                  </div>
                  <span className="admin-panel-index">10</span>
                </div>
                {dashboard.leaderboard.length ? (
                  <ol className="admin-ranking-list">
                    {dashboard.leaderboard.map((entry) => (
                      <li key={entry.publicCode}>
                        <span className="admin-rank">{entry.position}</span>
                        <span className="admin-ranking-player">
                          <strong>{entry.nickname}</strong>
                          <small>{entry.publicCode}</small>
                        </span>
                        <strong>{entry.points.toLocaleString("fr-FR")} pts</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="admin-panel-empty">Le classement se remplira avec les premières inscriptions.</p>
                )}
              </section>

              <section className="admin-panel admin-library" id="bibliotheque">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">Bibliothèque</p>
                    <h2>Questions</h2>
                  </div>
                  <span className="admin-panel-index">Q</span>
                </div>
                <div className="admin-library-total">
                  <strong>{dashboard.questionLibrary.total}</strong>
                  <span>questions au total</span>
                </div>
                <dl className="admin-library-breakdown">
                  <div><dt>Brouillons</dt><dd>{dashboard.questionLibrary.drafts}</dd></div>
                  <div><dt>En revue</dt><dd>{dashboard.questionLibrary.inReview}</dd></div>
                  <div><dt>Validées</dt><dd>{dashboard.questionLibrary.validated}</dd></div>
                </dl>
                <a className="admin-library-link" href="/admin/questions">
                  Gérer les questions et catégories →
                </a>
              </section>

              <section className="admin-panel admin-exports" id="exports">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">Données</p>
                    <h2>Exports CSV</h2>
                  </div>
                  <span className="admin-panel-index">CSV</span>
                </div>
                <p className="admin-panel-empty">
                  Fichiers UTF-8 prêts pour Excel et Google Sheets.
                </p>
                <div className="admin-export-actions">
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
                {exportMessage ? <p className="admin-export-message" role="status">{exportMessage}</p> : null}
              </section>

              <section className="admin-panel admin-audit" id="audit">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">Traçabilité</p>
                    <h2>Journal administrateur</h2>
                  </div>
                  <span className="admin-panel-index">{auditLogs.length}</span>
                </div>
                {auditLogs.length ? (
                  <ol className="admin-audit-list" aria-label="Journal des dernières actions administratives">
                    {auditLogs.map((entry) => (
                      <li key={entry.id}>
                        <span className="admin-audit-marker" aria-hidden="true" />
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
                  <p className="admin-panel-empty">Aucune action administrative journalisée.</p>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
