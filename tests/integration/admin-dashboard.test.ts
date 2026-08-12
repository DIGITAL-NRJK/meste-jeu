import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  adminSessions,
  adminUsers,
  answers,
  categories,
  events,
  players,
  questionOptions,
  questions,
  quizSessions,
  scoreEvents,
  sessionQuestions,
} from "../../db/schema";
import { hashAdminPassword } from "../../src/lib/auth/admin-password";
import { getDb } from "../../src/lib/db/client";
import { postgresAdminAuthRepository } from "../../src/server/repositories/admin-auth-repository";
import { postgresAdminDashboardRepository } from "../../src/server/repositories/admin-dashboard-repository";
import {
  AdminInvalidCredentialsError,
  getAuthenticatedAdmin,
  loginAdmin,
  logoutAdmin,
} from "../../src/server/services/admin-auth";
import { getAdminDashboard } from "../../src/server/services/admin-dashboard";

if (
  process.env.DATABASE_INTEGRATION_TARGET !== "neon-preview" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request"
) {
  throw new Error(
    "Database integration tests are restricted to Neon pull request branches.",
  );
}

const db = getDb();
const now = new Date("2026-08-15T20:00:00.000Z");
const authSecret = process.env.ADMIN_AUTH_SECRET ?? "";
const adminId = randomUUID();
const eventId = randomUUID();
const categoryId = randomUUID();
const questionId = randomUUID();
const optionIds = [randomUUID(), randomUUID()];
const sessionId = randomUUID();
const occurrenceId = randomUUID();
const playerIds = [randomUUID(), randomUUID()];
const answerId = randomUUID();
const scoreEventId = randomUUID();
const adminEmail = `integration-admin-${randomUUID()}@example.com`;
const eventSlug = `integration-admin-${randomUUID()}`;
const password = "Congo!AdminIntegration2026";

describe("admin authentication and dashboard with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(adminUsers).values({
      id: adminId,
      email: adminEmail,
      passwordHash: await hashAdminPassword(password),
      displayName: "Régie intégration",
    });
    await db.insert(events).values({
      id: eventId,
      slug: eventSlug,
      name: "Héritage Congo — intégration régie",
      startsAt: new Date("2026-08-15T18:00:00.000Z"),
      endsAt: new Date("2026-08-15T23:00:00.000Z"),
      timezone: "Africa/Brazzaville",
      status: "LIVE",
    });
    await db.insert(categories).values({
      id: categoryId,
      name: `Culture régie ${randomUUID()}`,
      slug: `culture-regie-${randomUUID()}`,
    });
    await db.insert(questions).values({
      id: questionId,
      categoryId,
      questionText: "Quelle ville accueille cette intégration de régie ?",
      explanation: "La réponse est Brazzaville pour ce scénario isolé.",
      difficulty: 1,
      status: "VALIDATED",
      validatedAt: now,
      validatedBy: adminId,
    });
    await db.insert(questionOptions).values([
      {
        id: optionIds[0],
        questionId,
        label: "A",
        text: "Brazzaville",
        isCorrect: true,
        position: 1,
      },
      {
        id: optionIds[1],
        questionId,
        label: "B",
        text: "Pointe-Noire",
        position: 2,
      },
    ]);
    await db.insert(quizSessions).values({
      id: sessionId,
      eventId,
      name: "Session régie intégration",
      slug: `session-regie-${randomUUID()}`,
      mode: "LIVE",
      status: "LIVE",
      startsAt: new Date("2026-08-15T19:30:00.000Z"),
    });
    await db.insert(sessionQuestions).values({
      id: occurrenceId,
      quizSessionId: sessionId,
      questionId,
      position: 1,
      durationSeconds: 30,
      status: "OPEN",
      opensAt: new Date("2026-08-15T19:59:45.000Z"),
      closesAt: new Date("2026-08-15T20:00:15.000Z"),
    });
    await db.insert(players).values([
      {
        id: playerIds[0],
        eventId,
        publicCode: `HC-${randomUUID()}`,
        nickname: "Makaya intégration",
        lastSeenAt: new Date("2026-08-15T19:58:00.000Z"),
      },
      {
        id: playerIds[1],
        eventId,
        publicCode: `HC-${randomUUID()}`,
        nickname: "Sanza intégration",
        lastSeenAt: new Date("2026-08-15T18:00:00.000Z"),
      },
    ]);
    await db.insert(answers).values({
      id: answerId,
      playerId: playerIds[0],
      sessionQuestionId: occurrenceId,
      questionOptionId: optionIds[0],
      receivedAt: new Date("2026-08-15T19:59:50.000Z"),
      responseTimeMs: 5_000,
      isCorrect: true,
    });
    await db.insert(scoreEvents).values({
      id: scoreEventId,
      playerId: playerIds[0],
      quizSessionId: sessionId,
      sessionQuestionId: occurrenceId,
      type: "ANSWER_CORRECT",
      points: 100,
    });
  });

  afterAll(async () => {
    await db.delete(adminSessions).where(eq(adminSessions.adminUserId, adminId));
    await db.delete(scoreEvents).where(eq(scoreEvents.id, scoreEventId));
    await db.delete(answers).where(eq(answers.id, answerId));
    await db.delete(sessionQuestions).where(eq(sessionQuestions.id, occurrenceId));
    await db.delete(players).where(eq(players.eventId, eventId));
    await db.delete(quizSessions).where(eq(quizSessions.id, sessionId));
    await db.delete(questionOptions).where(eq(questionOptions.questionId, questionId));
    await db.delete(questions).where(eq(questions.id, questionId));
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(events).where(eq(events.id, eventId));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
  });

  it("authentifie, supervise et révoque une session administrateur", async () => {
    const login = await loginAdmin(
      { email: adminEmail.toUpperCase(), password },
      {
        repository: postgresAdminAuthRepository,
        authSecret,
        now: () => now,
        createToken: () => `integration-admin-token-${randomUUID()}`,
      },
    );

    await expect(
      getAuthenticatedAdmin(login.session.token, {
        repository: postgresAdminAuthRepository,
        authSecret,
        now: () => now,
      }),
    ).resolves.toMatchObject({ id: adminId, email: adminEmail });

    const dashboard = await getAdminDashboard(eventSlug, {
      repository: postgresAdminDashboardRepository,
      now: () => now,
    });
    expect(dashboard).toMatchObject({
      event: { id: eventId, status: "LIVE" },
      participants: { registered: 2, activeRecently: 1 },
      session: { id: sessionId, status: "LIVE", questionCount: 1 },
      currentQuestion: {
        id: occurrenceId,
        status: "OPEN",
        answersReceived: 1,
        correctAnswers: 1,
        successRate: 100,
        averageResponseTimeMs: 5_000,
      },
      leaderboard: [{ position: 1, nickname: "Makaya intégration", points: 100 }],
    });

    await logoutAdmin(login.session.token, {
      repository: postgresAdminAuthRepository,
      authSecret,
      now: () => now,
    });
    await expect(
      getAuthenticatedAdmin(login.session.token, {
        repository: postgresAdminAuthRepository,
        authSecret,
        now: () => now,
      }),
    ).resolves.toBeNull();
  });

  it("verrouille le compte après cinq échecs persistés", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await postgresAdminAuthRepository.recordFailedLogin(adminId, now);
    }

    const stored = await postgresAdminAuthRepository.findUserByEmail(adminEmail);
    expect(stored?.lockedUntil?.getTime()).toBeGreaterThan(now.getTime());
    await expect(
      loginAdmin(
        { email: adminEmail, password },
        {
          repository: postgresAdminAuthRepository,
          authSecret,
          now: () => now,
        },
      ),
    ).rejects.toBeInstanceOf(AdminInvalidCredentialsError);
  });
});
