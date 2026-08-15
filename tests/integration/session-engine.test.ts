import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  adminUsers,
  answers,
  auditLogs,
  categories,
  events,
  players,
  scoreEvents,
  questionOptions,
  questions,
  questionSources,
  quizSessions,
  sessionQuestions,
} from "../../db/schema";
import { getDb } from "../../src/lib/db/client";
import { postgresQuestionLibraryRepository } from "../../src/server/repositories/question-library-repository";
import { postgresPlayerGameRepository } from "../../src/server/repositories/player-game-repository";
import { postgresSessionEngineRepository } from "../../src/server/repositories/session-engine-repository";
import {
  createCategory,
  createQuestionDraft,
  submitQuestionForReview,
  validateQuestion,
} from "../../src/server/services/question-library";
import {
  cancelSessionQuestion,
  closeCurrentSessionQuestion,
  configureSessionLineup,
  createQuizSession,
  finishQuizSession,
  getPublicSessionState,
  markSessionReady,
  openNextSessionQuestion,
  resetQuizSessionToDraft,
  revealCurrentSessionQuestion,
  SessionLineupError,
  SessionTransitionError,
  startQuizSession,
} from "../../src/server/services/session-engine";

if (
  process.env.DATABASE_INTEGRATION_TARGET !== "neon-preview" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request"
) {
  throw new Error(
    "Database integration tests are restricted to Neon pull request branches.",
  );
}

const db = getDb();
const actorAdminId = randomUUID();
const eventId = randomUUID();
const eventSlug = `integration-session-${randomUUID()}`;
const serverNow = new Date("2026-08-15T18:30:00.000Z");
let categoryId: string | undefined;
const questionIds: string[] = [];

const questionDependencies = {
  repository: postgresQuestionLibraryRepository,
  now: () => new Date("2026-08-15T17:00:00.000Z"),
};
const sessionDependencies = {
  repository: postgresSessionEngineRepository,
  now: () => serverNow,
};

function questionInput(sequence: number) {
  if (!categoryId) {
    throw new Error("Integration category was not created");
  }

  return {
    categoryId,
    questionText: `Question d’intégration ${sequence} sur la République du Congo ?`,
    explanation: `Explication culturelle de la question ${sequence}.`,
    difficulty: sequence,
    options: [
      { text: `Bonne réponse ${sequence}`, isCorrect: true },
      { text: `Autre réponse ${sequence}`, isCorrect: false },
    ],
    sources: [
      {
        publisher: "République du Congo",
        title: `Source vérifiée ${sequence}`,
        url: `https://example.com/integration/session-engine/${sequence}`,
        verifiedAt: new Date("2026-08-12T10:00:00.000Z"),
      },
    ],
  };
}

async function createValidatedQuestion(sequence: number) {
  const draft = await createQuestionDraft(
    questionInput(sequence),
    actorAdminId,
    questionDependencies,
  );
  questionIds.push(draft.id);
  await submitQuestionForReview(
    draft.id,
    actorAdminId,
    questionDependencies,
  );

  return validateQuestion(
    draft.id,
    actorAdminId,
    questionDependencies,
  );
}

describe("session engine with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(adminUsers).values({
      id: actorAdminId,
      email: `integration-session-${randomUUID()}@example.com`,
      passwordHash: "integration-test-only",
      displayName: "Admin intégration sessions",
    });
    await db.insert(events).values({
      id: eventId,
      slug: eventSlug,
      name: "Événement d’intégration du moteur de session",
      startsAt: new Date("2026-08-15T16:00:00.000Z"),
      endsAt: new Date("2026-08-15T23:00:00.000Z"),
      timezone: "Africa/Accra",
      status: "READY",
    });

    const category = await createCategory(
      { name: `Histoire session ${randomUUID()}` },
      postgresQuestionLibraryRepository,
    );
    categoryId = category.id;
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, actorAdminId));

    // Nettoie toutes les sessions de l'événement, y compris celles créées à la volée.
    const createdSessions = await db
      .select({ id: quizSessions.id })
      .from(quizSessions)
      .where(eq(quizSessions.eventId, eventId));

    if (createdSessions.length > 0) {
      const ids = createdSessions.map(({ id }) => id);
      await db.delete(sessionQuestions).where(inArray(sessionQuestions.quizSessionId, ids));
      await db.delete(quizSessions).where(inArray(quizSessions.id, ids));
    }

    if (questionIds.length > 0) {
      await db
        .delete(questionOptions)
        .where(inArray(questionOptions.questionId, questionIds));
      await db
        .delete(questionSources)
        .where(inArray(questionSources.questionId, questionIds));
      await db.delete(questions).where(inArray(questions.id, questionIds));
    }

    if (categoryId) {
      await db.delete(categories).where(eq(categories.id, categoryId));
    }

    await db.delete(events).where(eq(events.id, eventId));
    await db.delete(adminUsers).where(eq(adminUsers.id, actorAdminId));
  });

  it("exécute le cycle serveur sans révéler la réponse avant REVEALED", async () => {
    const unvalidatedQuestion = await createQuestionDraft(
      questionInput(3),
      actorAdminId,
      questionDependencies,
    );
    questionIds.push(unvalidatedQuestion.id);
    const firstQuestion = await createValidatedQuestion(1);
    const secondQuestion = await createValidatedQuestion(2);
    const session = await createQuizSession(
      {
        eventId,
        name: "Grand Quiz intégration session",
        mode: "LIVE",
      },
      actorAdminId,
      sessionDependencies,
    );

    await expect(
      markSessionReady(session.id, actorAdminId, sessionDependencies),
    ).rejects.toMatchObject({ reason: "no_questions" });
    await expect(
      configureSessionLineup(
        session.id,
        [{ questionId: unvalidatedQuestion.id, durationSeconds: 30 }],
        actorAdminId,
        sessionDependencies,
      ),
    ).rejects.toBeInstanceOf(SessionLineupError);

    const configured = await configureSessionLineup(
      session.id,
      [
        { questionId: firstQuestion.id, durationSeconds: 30 },
        { questionId: secondQuestion.id, durationSeconds: 45 },
      ],
      actorAdminId,
      sessionDependencies,
    );
    expect(configured.questions.map((question) => question.position)).toEqual([
      1, 2,
    ]);

    await markSessionReady(session.id, actorAdminId, sessionDependencies);
    const live = await startQuizSession(
      session.id,
      actorAdminId,
      sessionDependencies,
    );
    expect(live).toMatchObject({ status: "LIVE", startsAt: serverNow });
    await expect(
      db
        .select({ status: events.status })
        .from(events)
        .where(eq(events.id, eventId)),
    ).resolves.toEqual([{ status: "LIVE" }]);

    expect(
      (await getPublicSessionState(session.id, sessionDependencies))
        .currentQuestion,
    ).toBeNull();

    const opened = await openNextSessionQuestion(
      session.id,
      actorAdminId,
      sessionDependencies,
    );
    const [firstOccurrence, secondOccurrence] = opened.questions;

    if (!firstOccurrence || !secondOccurrence) {
      throw new Error("Configured occurrences are missing");
    }

    await expect(
      db
        .update(sessionQuestions)
        .set({
          status: "OPEN",
          opensAt: serverNow,
          closesAt: new Date(serverNow.getTime() + 45_000),
        })
        .where(eq(sessionQuestions.id, secondOccurrence.id)),
    ).rejects.toThrow();
    await expect(
      openNextSessionQuestion(
        session.id,
        actorAdminId,
        sessionDependencies,
      ),
    ).rejects.toMatchObject({
      constructor: SessionTransitionError,
      reason: "question_still_open",
    });

    const openState = await getPublicSessionState(
      session.id,
      sessionDependencies,
    );
    expect(openState.currentQuestion).toMatchObject({
      id: firstOccurrence.id,
      status: "OPEN",
      acceptingAnswers: true,
    });
    expect(JSON.stringify(openState)).not.toContain("isCorrect");
    expect(JSON.stringify(openState)).not.toContain("correctOptionId");
    expect(JSON.stringify(openState)).not.toContain("explanation");

    await expect(
      postgresPlayerGameRepository.findEventState(eventSlug),
    ).resolves.toMatchObject({
      event: { slug: eventSlug, status: "LIVE" },
      session: {
        id: session.id,
        status: "LIVE",
        currentQuestion: {
          id: firstOccurrence.id,
          status: "OPEN",
        },
      },
    });

    await closeCurrentSessionQuestion(
      session.id,
      actorAdminId,
      sessionDependencies,
    );
    await expect(
      openNextSessionQuestion(
        session.id,
        actorAdminId,
        sessionDependencies,
      ),
    ).rejects.toMatchObject({ reason: "unrevealed_question" });

    const closedState = await getPublicSessionState(
      session.id,
      sessionDependencies,
    );
    expect(closedState.currentQuestion).toMatchObject({
      status: "CLOSED",
      acceptingAnswers: false,
    });
    expect(JSON.stringify(closedState)).not.toContain("correctOptionId");

    await revealCurrentSessionQuestion(
      session.id,
      actorAdminId,
      sessionDependencies,
    );
    const revealedState = await getPublicSessionState(
      session.id,
      sessionDependencies,
    );
    expect(revealedState.currentQuestion).toMatchObject({
      status: "REVEALED",
      reveal: {
        correctOptionId: firstQuestion.options.find(
          (option) => option.isCorrect,
        )?.id,
        explanation: firstQuestion.explanation,
      },
    });

    await openNextSessionQuestion(
      session.id,
      actorAdminId,
      sessionDependencies,
    );
    await cancelSessionQuestion(
      secondOccurrence.id,
      actorAdminId,
      sessionDependencies,
    );
    const finished = await finishQuizSession(
      session.id,
      actorAdminId,
      sessionDependencies,
    );
    expect(finished.status).toBe("FINISHED");

    const logs = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.adminUserId, actorAdminId));
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        "SESSION_CREATED",
        "SESSION_STARTED",
        "QUESTION_STARTED",
        "QUESTION_CLOSED",
        "QUESTION_REVEALED",
        "QUESTION_CANCELED",
        "SESSION_FINISHED",
      ]),
    );
  });

  it("rouvre une session prête jamais lancée, puis refuse après le premier lancement", async () => {
    const premiere = await createValidatedQuestion(3);
    const seconde = await createValidatedQuestion(4);

    const session = await createQuizSession(
      {
        eventId,
        name: `Séquence réouvrable ${randomUUID()}`,
        mode: "LIVE",
        resetScore: false,
      },
      actorAdminId,
      sessionDependencies,
    );

    await configureSessionLineup(
      session.id,
      [
        { questionId: premiere.id, durationSeconds: 30 },
        { questionId: seconde.id, durationSeconds: 30 },
      ],
      actorAdminId,
      sessionDependencies,
    );
    await markSessionReady(session.id, actorAdminId, sessionDependencies);

    // 1. Jamais lancée : la réouverture est autorisée et le conducteur redevient modifiable.
    const reopened = await resetQuizSessionToDraft(
      session.id,
      actorAdminId,
      sessionDependencies,
    );
    expect(reopened.status).toBe("DRAFT");

    const trimmed = await configureSessionLineup(
      session.id,
      [{ questionId: premiere.id, durationSeconds: 20 }],
      actorAdminId,
      sessionDependencies,
    );
    expect(trimmed.questions).toHaveLength(1);

    // 2. L'action est journalisée.
    const journal = await db
      .select({ action: auditLogs.action, entityId: auditLogs.entityId })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, session.id));
    expect(journal.map(({ action }) => action)).toContain("SESSION_RESET_DRAFT");

    // 3. Une fois la session lancée et une question ouverte, le verrou est définitif.
    await markSessionReady(session.id, actorAdminId, sessionDependencies);
    await startQuizSession(session.id, actorAdminId, sessionDependencies);
    await openNextSessionQuestion(session.id, actorAdminId, sessionDependencies);
    await closeCurrentSessionQuestion(session.id, actorAdminId, sessionDependencies);
    await revealCurrentSessionQuestion(session.id, actorAdminId, sessionDependencies);
    await finishQuizSession(session.id, actorAdminId, sessionDependencies);

    await expect(
      resetQuizSessionToDraft(session.id, actorAdminId, sessionDependencies),
    ).rejects.toMatchObject({ name: "SessionInvalidStatusError" });

    // 4. Et même remise en « prête » par une réinitialisation d'événement, elle reste verrouillée.
    await db
      .update(quizSessions)
      .set({ status: "READY" })
      .where(eq(quizSessions.id, session.id));

    await expect(
      resetQuizSessionToDraft(session.id, actorAdminId, sessionDependencies),
    ).rejects.toMatchObject({
      name: "SessionTransitionError",
      reason: "already_played",
    });
  });

  it("rouvre une session répétée en contexte test, une fois les joueurs de test purgés", async () => {
    const question = await createValidatedQuestion(2);
    const testEventId = randomUUID();

    await db.insert(events).values({
      id: testEventId,
      slug: `integration-test-context-${randomUUID()}`,
      name: "Événement de répétition en contexte test",
      startsAt: new Date("2026-08-15T16:00:00.000Z"),
      endsAt: new Date("2026-08-15T23:00:00.000Z"),
      timezone: "Africa/Accra",
      status: "READY",
      environment: "TEST",
    });

    const session = await createQuizSession(
      { eventId: testEventId, name: `Répétition ${randomUUID()}`, mode: "LIVE", resetScore: false },
      actorAdminId,
      sessionDependencies,
    );
    await configureSessionLineup(
      session.id,
      [{ questionId: question.id, durationSeconds: 30 }],
      actorAdminId,
      sessionDependencies,
    );
    await markSessionReady(session.id, actorAdminId, sessionDependencies);

    // Répétition complète : la question est jouée puis révélée.
    await startQuizSession(session.id, actorAdminId, sessionDependencies);
    await openNextSessionQuestion(session.id, actorAdminId, sessionDependencies);
    await closeCurrentSessionQuestion(session.id, actorAdminId, sessionDependencies);
    const played = await revealCurrentSessionQuestion(session.id, actorAdminId, sessionDependencies);
    const occurrence = played.questions[0];
    expect(occurrence.opensAt).not.toBeNull();

    const playerId = randomUUID();
    await db.insert(players).values({
      id: playerId,
      eventId: testEventId,
      publicCode: `HC-${randomUUID().slice(0, 4)}`,
      nickname: `Testeur ${randomUUID().slice(0, 8)}`,
    });
    await db.insert(answers).values({
      playerId,
      sessionQuestionId: occurrence.id,
      questionOptionId: (await db
        .select({ id: questionOptions.id })
        .from(questionOptions)
        .where(eq(questionOptions.questionId, question.id))
        .limit(1))[0].id,
      receivedAt: serverNow,
      responseTimeMs: 4200,
      isCorrect: true,
    });
    await db.insert(scoreEvents).values({
      playerId,
      quizSessionId: session.id,
      sessionQuestionId: occurrence.id,
      type: "ANSWER_CORRECT",
      points: 100,
    });

    // Le contexte test ne suffit pas : tant qu'une réponse subsiste, le conducteur reste verrouillé.
    await db.update(quizSessions).set({ status: "READY" }).where(eq(quizSessions.id, session.id));
    await expect(
      resetQuizSessionToDraft(session.id, actorAdminId, sessionDependencies),
    ).rejects.toMatchObject({ name: "SessionTransitionError", reason: "already_played" });

    // Purge des joueurs de test, exactement comme depuis la régie.
    await db.delete(scoreEvents).where(eq(scoreEvents.playerId, playerId));
    await db.delete(answers).where(eq(answers.playerId, playerId));
    await db.delete(players).where(eq(players.id, playerId));

    // Cette fois la réouverture est autorisée et l'occurrence redevient vierge.
    const reopened = await resetQuizSessionToDraft(session.id, actorAdminId, sessionDependencies);
    expect(reopened.status).toBe("DRAFT");
    expect(reopened.questions[0].status).toBe("PENDING");
    expect(reopened.questions[0].opensAt).toBeNull();
    expect(reopened.questions[0].closesAt).toBeNull();
    expect(reopened.questions[0].revealedAt).toBeNull();

    // En contexte production, la même situation reste refusée.
    await db.update(quizSessions).set({ status: "READY" }).where(eq(quizSessions.id, session.id));
    await db
      .update(sessionQuestions)
      .set({ opensAt: serverNow, status: "REVEALED" })
      .where(eq(sessionQuestions.quizSessionId, session.id));
    await db.update(events).set({ environment: "PRODUCTION" }).where(eq(events.id, testEventId));

    await expect(
      resetQuizSessionToDraft(session.id, actorAdminId, sessionDependencies),
    ).rejects.toMatchObject({ name: "SessionTransitionError", reason: "already_played" });

    await db.delete(sessionQuestions).where(eq(sessionQuestions.quizSessionId, session.id));
    await db.delete(quizSessions).where(eq(quizSessions.id, session.id));
    await db.delete(events).where(eq(events.id, testEventId));
  });
});
