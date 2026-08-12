"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import {
  formatPoints,
  getDifficultyLabel,
  getPollingDelay,
  getQuestionProgress,
  getRemainingSeconds,
} from "@/lib/game/player-interface";

type Player = {
  publicCode: string;
  nickname: string;
  currentStreak: number;
  totalPoints: number;
};

type CurrentPlayer = {
  player: Player;
  event: {
    slug: string;
    name: string;
    timezone: string;
    status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
  };
};

type EventState = {
  event: Pick<CurrentPlayer["event"], "slug" | "name" | "status">;
  session: {
    id: string;
    name: string;
    mode: "DISCOVERY" | "LIVE";
    status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
    startsAt: string | null;
    endsAt: string | null;
    currentQuestion: {
      id: string;
      status: "OPEN" | "CLOSED" | "REVEALED" | "CANCELED";
      opensAt: string;
      closesAt: string;
      revealedAt: string | null;
      canceledAt: string | null;
    } | null;
  } | null;
};

type QuestionOption = { id: string; label: string; text: string };

type CurrentQuestion = {
  id: string;
  position: number;
  totalQuestions: number;
  durationSeconds: number;
  status: "PENDING" | "OPEN" | "CLOSED" | "REVEALED" | "CANCELED";
  opensAt: string | null;
  closesAt: string | null;
  revealedAt: string | null;
  canceledAt: string | null;
  acceptingAnswers: boolean;
  category: { name: string; slug: string };
  questionText: string;
  difficulty: number;
  mediaType: "TEXT" | "IMAGE";
  mediaUrl: string | null;
  options: QuestionOption[];
  reveal?: { correctOptionId: string; explanation: string };
};

type SessionState = {
  session: {
    id: string;
    name: string;
    slug: string;
    mode: "DISCOVERY" | "LIVE";
    status: "DRAFT" | "READY" | "LIVE" | "FINISHED" | "CANCELED";
    startsAt: string | null;
    endsAt: string | null;
  };
  currentQuestion: CurrentQuestion | null;
};

type AnswerResult =
  | { status: "PENDING" | "OPEN" | "CLOSED"; answerSubmitted: boolean }
  | { status: "CANCELED"; answerSubmitted: boolean; totalPoints: 0 }
  | {
      status: "REVEALED";
      answerSubmitted: boolean;
      selectedOptionId: string | null;
      correctOptionId: string;
      isCorrect: boolean | null;
      explanation: string;
      score: {
        answerPoints: number;
        difficultyBonus: number;
        speedBonus: number;
        streakBonus: number;
      };
      totalPoints: number;
    };

type ApiError = { error?: { code?: string; message?: string } };

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`brand-header${compact ? " brand-header--compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        M
      </span>
      <span>
        <strong>MESTE</strong>
        <small>Héritage Congo</small>
      </span>
    </header>
  );
}

function Registration({
  eventSlug,
  onRegistered,
}: {
  eventSlug: string;
  onRegistered: (player: CurrentPlayer) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventSlug, nickname }),
      });
      const body = await readJson<CurrentPlayer & ApiError>(response);

      if (!response.ok) {
        setError(
          body.error?.message ?? "L’inscription n’a pas pu être finalisée.",
        );
        return;
      }

      onRegistered(body);
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau puis réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="player-page player-page--centered">
      <div className="ambient-orbit" aria-hidden="true" />
      <section className="player-card registration-card">
        <BrandHeader />
        <div className="registration-copy">
          <p className="eyebrow">Le quiz culturel par MESTE</p>
          <h1>Quel nom porterez-vous dans le jeu&nbsp;?</h1>
          <p>
            Choisissez un pseudo de 3 à 20 caractères. Il restera associé à
            votre progression pendant l’événement.
          </p>
        </div>
        <form onSubmit={submit} className="registration-form">
          <label htmlFor="nickname">Votre nom de joueur</label>
          <input
            id="nickname"
            name="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            minLength={3}
            maxLength={20}
            autoComplete="nickname"
            placeholder="Ex. Makaya"
            required
            autoFocus
            aria-describedby={error ? "registration-error" : undefined}
          />
          {error ? (
            <p id="registration-error" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Inscription…" : "Entrer dans le jeu"}
          </button>
        </form>
        <p className="privacy-note">
          Aucun email ni numéro de téléphone n’est demandé.
        </p>
      </section>
    </main>
  );
}

function PlayerSummary({ player }: { player: Player }) {
  return (
    <div className="player-summary" aria-label="Votre progression">
      <div>
        <span>Score</span>
        <strong>{formatPoints(player.totalPoints)} pts</strong>
      </div>
      <div>
        <span>Série</span>
        <strong>{player.currentStreak}</strong>
      </div>
    </div>
  );
}

function Lobby({ player, state }: { player: Player; state: EventState }) {
  const session = state.session;
  const finished = session?.status === "FINISHED" || state.event.status === "FINISHED";

  return (
    <main className="player-page">
      <div className="game-frame">
        <BrandHeader compact />
        <PlayerSummary player={player} />
        <section className="lobby-panel" aria-live="polite">
          <div className="waiting-emblem" aria-hidden="true">
            <span />
          </div>
          <p className="eyebrow">Bienvenue, {player.nickname}</p>
          <h1>{finished ? "La session est terminée" : "La table se prépare"}</h1>
          <p>
            {finished
              ? "Votre participation est bien enregistrée. Le classement arrive dans la prochaine étape."
              : session
                ? `${session.name} commencera dès que l’animateur donnera le signal.`
                : "Aucune session n’est ouverte pour le moment. Gardez cette page à portée de main."}
          </p>
          {!finished ? (
            <div className="waiting-status">
              <span className="status-dot" />
              En attente du direct
            </div>
          ) : null}
        </section>
        <p className="player-code">Code joueur · {player.publicCode}</p>
      </div>
    </main>
  );
}

function QuestionView({
  question,
  result,
  selectedOptionId,
  submitting,
  submissionMessage,
  onAnswer,
}: {
  question: CurrentQuestion;
  result: AnswerResult | null;
  selectedOptionId: string | null;
  submitting: boolean;
  submissionMessage: string | null;
  onAnswer: (optionId: string) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const remainingSeconds = question.closesAt
    ? getRemainingSeconds(question.closesAt, nowMs)
    : 0;
  const progress =
    question.opensAt && question.closesAt
      ? getQuestionProgress(question.opensAt, question.closesAt, nowMs)
      : 0;
  const revealed =
    question.status === "REVEALED" ? (question.reveal ?? null) : null;
  const canceled = question.status === "CANCELED";
  const answerSubmitted = selectedOptionId !== null || result?.answerSubmitted;
  const canAnswer =
    question.status === "OPEN" &&
    question.acceptingAnswers &&
    remainingSeconds > 0 &&
    !answerSubmitted &&
    !submitting;

  return (
    <section className="question-panel">
      <div className="question-meta">
        <span>
          Question {String(question.position).padStart(2, "0")} / {question.totalQuestions}
        </span>
        <span>{getDifficultyLabel(question.difficulty)}</span>
      </div>
      <div className="category-line">
        <span>{question.category.name}</span>
        {question.status === "OPEN" ? (
          <div
            className="countdown"
            style={{ "--time-progress": progress } as React.CSSProperties}
            aria-label={`${remainingSeconds} secondes restantes`}
          >
            <strong>{String(remainingSeconds).padStart(2, "0")}</strong>
            <small>sec</small>
          </div>
        ) : null}
      </div>
      <h1>{question.questionText}</h1>

      {question.mediaType === "IMAGE" && question.mediaUrl ? (
        <div className="question-media">
          <Image
            src={question.mediaUrl}
            alt="Illustration de la question"
            fill
            sizes="(max-width: 600px) 100vw, 560px"
            unoptimized
          />
        </div>
      ) : null}

      <div className="answer-list" aria-label="Propositions">
        {question.options.map((option) => {
          const isSelected =
            option.id === selectedOptionId ||
            (result?.status === "REVEALED" && option.id === result.selectedOptionId);
          const isCorrect = revealed?.correctOptionId === option.id;
          const isWrongSelection = Boolean(revealed && isSelected && !isCorrect);

          return (
            <button
              key={option.id}
              type="button"
              className={`answer-option${isSelected ? " answer-option--selected" : ""}${isCorrect ? " answer-option--correct" : ""}${isWrongSelection ? " answer-option--wrong" : ""}`}
              onClick={() => onAnswer(option.id)}
              disabled={!canAnswer}
              aria-pressed={isSelected}
            >
              <span className="answer-label">{option.label}</span>
              <span>{option.text}</span>
              {isCorrect ? <span className="answer-icon" aria-label="Bonne réponse">✓</span> : null}
              {isWrongSelection ? <span className="answer-icon" aria-label="Votre réponse">×</span> : null}
            </button>
          );
        })}
      </div>

      <div className="answer-feedback" aria-live="polite">
        {submitting ? <p>Enregistrement de votre réponse…</p> : null}
        {submissionMessage ? <p>{submissionMessage}</p> : null}
        {question.status === "CLOSED" ? (
          <p>Réponses closes · La correction arrive dans un instant.</p>
        ) : null}
        {question.status === "OPEN" && remainingSeconds === 0 ? (
          <p>Temps écoulé · Validation par le serveur en cours.</p>
        ) : null}
        {canceled ? <p>Cette question a été annulée. Aucun point n’est compté.</p> : null}
      </div>

      {revealed ? (
        <div className="reveal-panel">
          <p className="eyebrow">Le saviez-vous&nbsp;?</p>
          <p>{revealed.explanation}</p>
          <div className="reveal-score">
            <span>{result?.status === "REVEALED" && result.isCorrect ? "Bonne réponse" : "Résultat"}</span>
            <strong>+{result?.status === "REVEALED" ? result.totalPoints : 0} pts</strong>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function GameScreen({
  player,
  state,
  result,
  selectedOptionId,
  submitting,
  submissionMessage,
  onAnswer,
}: {
  player: Player;
  state: SessionState;
  result: AnswerResult | null;
  selectedOptionId: string | null;
  submitting: boolean;
  submissionMessage: string | null;
  onAnswer: (optionId: string) => void;
}) {
  return (
    <main className="player-page">
      <div className="game-frame">
        <BrandHeader compact />
        <PlayerSummary player={player} />
        {state.currentQuestion ? (
          <QuestionView
            question={state.currentQuestion}
            result={result}
            selectedOptionId={selectedOptionId}
            submitting={submitting}
            submissionMessage={submissionMessage}
            onAnswer={onAnswer}
          />
        ) : (
          <section className="lobby-panel">
            <p className="eyebrow">Session en direct</p>
            <h1>Prochaine question</h1>
            <p>Elle apparaîtra ici dès son ouverture par l’animateur.</p>
          </section>
        )}
      </div>
    </main>
  );
}

export function PlayerGame({ eventSlug }: { eventSlug: string }) {
  const [bootState, setBootState] = useState<"loading" | "visitor" | "ready" | "error">("loading");
  const [player, setPlayer] = useState<CurrentPlayer | null>(null);
  const [eventState, setEventState] = useState<EventState | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const questionKeyRef = useRef<string | null>(null);
  const hasSessionStateRef = useRef(false);

  const refreshPlayer = useCallback(async () => {
    const response = await fetch("/api/me", { cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    const currentPlayer = await readJson<CurrentPlayer>(response);
    setPlayer(currentPlayer);
    return currentPlayer;
  }, []);

  useEffect(() => {
    let active = true;

    async function restore() {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });

        if (!active) return;
        if (response.status === 401) {
          setBootState("visitor");
          return;
        }
        if (!response.ok) {
          throw new Error("player_restore_failed");
        }

        const currentPlayer = await readJson<CurrentPlayer>(response);
        setPlayer(currentPlayer);
        setBootState("ready");
      } catch {
        if (active) {
          setFatalError("Le jeu est momentanément inaccessible. Réessayez dans quelques instants.");
          setBootState("error");
        }
      }
    }

    void restore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (bootState !== "ready") return;

    let active = true;
    let timeoutId: number | undefined;

    async function poll() {
      try {
        const eventResponse = await fetch(`/api/events/${eventSlug}/state`, {
          cache: "no-store",
        });
        if (!eventResponse.ok) throw new Error("event_state_failed");

        const nextEventState = await readJson<EventState>(eventResponse);
        if (!active) return;
        setEventState(nextEventState);

        const current = nextEventState.session?.currentQuestion;
        const nextKey = current
          ? `${nextEventState.session?.id}:${current.id}:${current.status}`
          : null;

        if (
          nextEventState.session &&
          (nextKey !== questionKeyRef.current || !hasSessionStateRef.current)
        ) {
          const questionResponse = await fetch(
            `/api/sessions/${nextEventState.session.id}/current-question`,
            { cache: "no-store" },
          );
          if (!questionResponse.ok) throw new Error("question_state_failed");
          const nextSessionState = await readJson<SessionState>(questionResponse);

          if (!active) return;
          if (current && questionKeyRef.current?.split(":")[1] !== current.id) {
            setSelectedOptionId(null);
            setSubmissionMessage(null);
            setResult(null);
          }
          questionKeyRef.current = nextKey;
          hasSessionStateRef.current = true;
          setSessionState(nextSessionState);

          if (current) {
            const resultResponse = await fetch(
              `/api/session-questions/${current.id}/result`,
              { cache: "no-store" },
            );
            if (resultResponse.ok && active) {
              const nextResult = await readJson<AnswerResult>(resultResponse);
              setResult(nextResult);
              if (nextResult.status === "REVEALED") {
                await refreshPlayer();
              }
            }
          }
        }
        setFatalError(null);
      } catch {
        if (active) {
          setFatalError("La synchronisation a été interrompue. Nouvelle tentative automatique…");
        }
      } finally {
        if (active) {
          timeoutId = window.setTimeout(poll, getPollingDelay(Math.random()));
        }
      }
    }

    void poll();
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [bootState, eventSlug, refreshPlayer]);

  async function answer(optionId: string) {
    const occurrenceId = sessionState?.currentQuestion?.id;
    if (!occurrenceId || selectedOptionId || submitting) return;

    setSelectedOptionId(optionId);
    setSubmitting(true);
    setSubmissionMessage(null);

    try {
      const response = await fetch(
        `/api/session-questions/${occurrenceId}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId }),
        },
      );
      const body = await readJson<ApiError>(response);

      if (!response.ok) {
        if (response.status === 410) {
          setSubmissionMessage("Le délai venait de se terminer. Réponse non comptée.");
        } else if (body.error?.code === "ANSWER_ALREADY_SUBMITTED") {
          setSubmissionMessage("Votre première réponse est déjà enregistrée.");
        } else {
          setSelectedOptionId(null);
          setSubmissionMessage(body.error?.message ?? "La réponse n’a pas été enregistrée.");
        }
        return;
      }

      setSubmissionMessage("Réponse enregistrée ✓");
    } catch {
      setSelectedOptionId(null);
      setSubmissionMessage("Connexion interrompue. Touchez à nouveau votre réponse.");
    } finally {
      setSubmitting(false);
    }
  }

  if (bootState === "loading") {
    return (
      <main className="player-page player-page--centered">
        <div className="loading-mark" aria-label="Chargement du jeu"><span /></div>
      </main>
    );
  }

  if (bootState === "visitor") {
    return (
      <Registration
        eventSlug={eventSlug}
        onRegistered={(registered) => {
          setPlayer(registered);
          setBootState("ready");
        }}
      />
    );
  }

  if (bootState === "error" || !player) {
    return (
      <main className="player-page player-page--centered">
        <section className="player-card error-card" role="alert">
          <BrandHeader />
          <h1>Le service fait une pause</h1>
          <p>{fatalError}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            Réessayer
          </button>
        </section>
      </main>
    );
  }

  if (player.event.slug !== eventSlug) {
    return (
      <main className="player-page player-page--centered">
        <section className="player-card error-card">
          <BrandHeader />
          <h1>Un autre événement est déjà ouvert</h1>
          <p>Ce navigateur reconnaît {player.player.nickname} pour {player.event.name}.</p>
        </section>
      </main>
    );
  }

  if (!eventState) {
    return (
      <main className="player-page player-page--centered">
        <div className="loading-mark" aria-label="Synchronisation du jeu"><span /></div>
      </main>
    );
  }

  return sessionState && eventState.session?.status === "LIVE" ? (
    <>
      {fatalError ? <div className="sync-notice" role="status">{fatalError}</div> : null}
      <GameScreen
        player={player.player}
        state={sessionState}
        result={result}
        selectedOptionId={selectedOptionId}
        submitting={submitting}
        submissionMessage={submissionMessage}
        onAnswer={answer}
      />
    </>
  ) : (
    <Lobby player={player.player} state={eventState} />
  );
}
