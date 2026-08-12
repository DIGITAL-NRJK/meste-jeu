import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  adminUsers,
  auditLogs,
  categories,
  events,
  questionOptions,
  questions,
  questionSources,
  quizSessions,
  sessionQuestions,
} from "../../db/schema";
import { getDb } from "../../src/lib/db/client";
import { postgresQuestionLibraryRepository } from "../../src/server/repositories/question-library-repository";
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
let quizSessionId: string | undefined;
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

    if (quizSessionId) {
      await db
        .delete(sessionQuestions)
        .where(eq(sessionQuestions.quizSessionId, quizSessionId));
      await db.delete(quizSessions).where(eq(quizSessions.id, quizSessionId));
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
    quizSessionId = session.id;

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
});
