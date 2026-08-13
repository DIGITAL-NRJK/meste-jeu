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
  playerSessions,
  questionOptions,
  questions,
  quizSessions,
  scoreEvents,
  sessionQuestions,
} from "../../db/schema";
import { getDb } from "../../src/lib/db/client";
import { postgresAdminPlayerManagementRepository } from "../../src/server/repositories/admin-player-management-repository";
import { postgresLeaderboardRepository } from "../../src/server/repositories/leaderboard-repository";
import {
  adjustAdminPlayerScore,
  disableAdminPlayer,
  getAdminPlayer,
  getAdminPlayerManagement,
} from "../../src/server/services/admin-player-management";
import { getLeaderboard } from "../../src/server/services/leaderboard";

if (
  process.env.DATABASE_INTEGRATION_TARGET !== "neon-preview" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request"
) {
  throw new Error(
    "Database integration tests are restricted to Neon pull request branches.",
  );
}

const db = getDb();
const now = new Date("2026-08-13T12:00:00.000Z");
const adminId = randomUUID();
const eventId = randomUUID();
const categoryId = randomUUID();
const sessionId = randomUUID();
const playerIds = [randomUUID(), randomUUID()];
const playerSessionId = randomUUID();
const questionIds = [randomUUID(), randomUUID()];
const occurrenceIds = [randomUUID(), randomUUID()];
const optionIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const answerIds = [randomUUID(), randomUUID()];
const scoreEventId = randomUUID();
const adjustmentId = randomUUID();
const rejectedAdjustmentId = randomUUID();
const eventSlug = `integration-player-admin-${randomUUID()}`;
const publicCode = `PC-${randomUUID()}`;

describe("admin player management with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(adminUsers).values({
      id: adminId,
      email: `integration-player-admin-${randomUUID()}@example.com`,
      passwordHash: "integration-test-only",
      displayName: "Régie joueurs intégration",
    });
    await db.insert(events).values({
      id: eventId,
      slug: eventSlug,
      name: "Événement intégration joueurs Congo",
      startsAt: new Date("2026-08-15T16:00:00.000Z"),
      endsAt: new Date("2026-08-15T22:00:00.000Z"),
      timezone: "Africa/Accra",
      status: "READY",
    });
    await db.insert(categories).values({
      id: categoryId,
      name: `Histoire joueurs ${randomUUID()}`,
      slug: `histoire-joueurs-${randomUUID()}`,
    });
    await db.insert(questions).values(
      questionIds.map((id, index) => ({
        id,
        categoryId,
        questionText: `Question joueur ${index + 1} sur la République du Congo ?`,
        explanation: `Explication joueur ${index + 1}.`,
        difficulty: 1,
        status: "VALIDATED" as const,
        validatedAt: now,
        validatedBy: adminId,
      })),
    );
    await db.insert(questionOptions).values([
      {
        id: optionIds[0],
        questionId: questionIds[0],
        label: "A",
        text: "Réponse correcte encore masquée",
        isCorrect: true,
        position: 1,
      },
      {
        id: optionIds[1],
        questionId: questionIds[0],
        label: "B",
        text: "Autre réponse",
        position: 2,
      },
      {
        id: optionIds[2],
        questionId: questionIds[1],
        label: "A",
        text: "Réponse incorrecte révélée",
        position: 1,
      },
      {
        id: optionIds[3],
        questionId: questionIds[1],
        label: "B",
        text: "Réponse correcte révélée",
        isCorrect: true,
        position: 2,
      },
    ]);
    await db.insert(quizSessions).values({
      id: sessionId,
      eventId,
      name: "Session joueurs intégration",
      slug: `session-joueurs-${randomUUID()}`,
      mode: "LIVE",
      status: "READY",
    });
    await db.insert(sessionQuestions).values([
      {
        id: occurrenceIds[0],
        quizSessionId: sessionId,
        questionId: questionIds[0],
        position: 1,
        durationSeconds: 30,
        status: "CLOSED",
        opensAt: new Date("2026-08-13T11:58:00.000Z"),
        closesAt: new Date("2026-08-13T11:58:30.000Z"),
      },
      {
        id: occurrenceIds[1],
        quizSessionId: sessionId,
        questionId: questionIds[1],
        position: 2,
        durationSeconds: 30,
        status: "REVEALED",
        opensAt: new Date("2026-08-13T11:59:00.000Z"),
        closesAt: new Date("2026-08-13T11:59:30.000Z"),
        revealedAt: new Date("2026-08-13T11:59:35.000Z"),
      },
    ]);
    await db.insert(players).values([
      {
        id: playerIds[0],
        eventId,
        publicCode,
        nickname: "Makaya test joueurs",
        currentStreak: 1,
        lastSeenAt: now,
      },
      {
        id: playerIds[1],
        eventId,
        publicCode: `PC-${randomUUID()}`,
        nickname: "Sanza test joueurs",
      },
    ]);
    await db.insert(playerSessions).values({
      id: playerSessionId,
      playerId: playerIds[0],
      tokenHash: `integration-player-token-${randomUUID()}`,
      expiresAt: new Date("2026-08-16T12:00:00.000Z"),
    });
    await db.insert(answers).values([
      {
        id: answerIds[0],
        playerId: playerIds[0],
        sessionQuestionId: occurrenceIds[0],
        questionOptionId: optionIds[0],
        receivedAt: new Date("2026-08-13T11:58:10.000Z"),
        responseTimeMs: 10_000,
        isCorrect: true,
      },
      {
        id: answerIds[1],
        playerId: playerIds[0],
        sessionQuestionId: occurrenceIds[1],
        questionOptionId: optionIds[2],
        receivedAt: new Date("2026-08-13T11:59:12.000Z"),
        responseTimeMs: 12_000,
        isCorrect: false,
      },
    ]);
    await db.insert(scoreEvents).values({
      id: scoreEventId,
      playerId: playerIds[0],
      quizSessionId: sessionId,
      sessionQuestionId: occurrenceIds[0],
      type: "ANSWER_CORRECT",
      points: 125,
    });
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminId));
    await db.delete(scoreEvents).where(eq(scoreEvents.playerId, playerIds[0]));
    await db.delete(answers).where(inArray(answers.id, answerIds));
    await db.delete(playerSessions).where(eq(playerSessions.id, playerSessionId));
    await db.delete(players).where(inArray(players.id, playerIds));
    await db.delete(sessionQuestions).where(inArray(sessionQuestions.id, occurrenceIds));
    await db.delete(quizSessions).where(eq(quizSessions.id, sessionId));
    await db.delete(questionOptions).where(inArray(questionOptions.id, optionIds));
    await db.delete(questions).where(inArray(questions.id, questionIds));
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(events).where(eq(events.id, eventId));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
  });

  it("recherche un joueur par pseudo ou code et calcule son score depuis le ledger", async () => {
    const byNickname = await getAdminPlayerManagement(
      { eventSlug, search: "makaya", status: "ACTIVE" },
      postgresAdminPlayerManagementRepository,
    );
    expect(byNickname.players).toEqual([
      expect.objectContaining({
        id: playerIds[0],
        publicCode,
        totalPoints: 125,
        answerCount: 2,
      }),
    ]);

    const byCode = await getAdminPlayerManagement(
      { eventSlug, search: publicCode.slice(0, 10) },
      postgresAdminPlayerManagementRepository,
    );
    expect(byCode.players.some((player) => player.id === playerIds[0])).toBe(true);
  });

  it("masque la correction avant REVEALED dans la fiche administrateur", async () => {
    const detail = await getAdminPlayer(
      playerIds[0],
      postgresAdminPlayerManagementRepository,
    );
    const closed = detail.answers.find(
      (answer) => answer.questionStatus === "CLOSED",
    );
    const revealed = detail.answers.find(
      (answer) => answer.questionStatus === "REVEALED",
    );

    expect(closed?.isCorrect).toBeNull();
    expect(revealed?.isCorrect).toBe(false);
  });

  it("ajoute la correction au ledger et recalcule le classement avec son audit", async () => {
    await expect(
      adjustAdminPlayerScore(
        playerIds[0],
        {
          action: "ADJUST_SCORE",
          quizSessionId: randomUUID(),
          points: 50,
          reason: "Session étrangère refusée pendant la recette",
        },
        adminId,
        {
          repository: postgresAdminPlayerManagementRepository,
          createId: () => rejectedAdjustmentId,
          now: () => now,
        },
      ),
    ).rejects.toMatchObject({ name: "AdminPlayerSessionNotFoundError" });

    const adjusted = await adjustAdminPlayerScore(
      playerIds[0],
      {
        action: "ADJUST_SCORE",
        quizSessionId: sessionId,
        points: -50,
        reason: "Correction de recette validée par la régie",
      },
      adminId,
      {
        repository: postgresAdminPlayerManagementRepository,
        createId: () => adjustmentId,
        now: () => now,
      },
    );

    expect(adjusted.totalPoints).toBe(75);
    expect(adjusted.scoreSessions).toContainEqual(
      expect.objectContaining({ id: sessionId, points: 75 }),
    );
    expect(adjusted.scoreAdjustments).toEqual([
      expect.objectContaining({
        id: adjustmentId,
        quizSessionId: sessionId,
        points: -50,
        reason: "Correction de recette validée par la régie",
        adminDisplayName: "Régie joueurs intégration",
      }),
    ]);

    const leaderboard = await getLeaderboard(
      { eventSlug, sessionId },
      undefined,
      {
        repository: postgresLeaderboardRepository,
        sessionSecret: "integration-session-secret-not-used",
        now: () => now,
      },
    );
    expect(leaderboard.entries[0]).toMatchObject({
      publicCode,
      points: 75,
      position: 1,
    });

    const [scoreRow, auditRow] = await db.batch([
      db
        .select({
          type: scoreEvents.type,
          points: scoreEvents.points,
          metadata: scoreEvents.metadata,
          createdByAdminId: scoreEvents.createdByAdminId,
        })
        .from(scoreEvents)
        .where(eq(scoreEvents.id, adjustmentId)),
      db
        .select({
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadata: auditLogs.metadata,
        })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, adjustmentId)),
    ]);
    expect(scoreRow[0]).toEqual({
      type: "ADMIN_ADJUSTMENT",
      points: -50,
      metadata: { reason: "Correction de recette validée par la régie" },
      createdByAdminId: adminId,
    });
    expect(auditRow[0]).toEqual(
      expect.objectContaining({
        action: "SCORE_ADJUSTED",
        entityType: "score_event",
        entityId: adjustmentId,
        metadata: expect.objectContaining({
          playerId: playerIds[0],
          quizSessionId: sessionId,
          points: -50,
          reason: "Correction de recette validée par la régie",
        }),
      }),
    );
    await expect(
      db
        .select({ id: scoreEvents.id })
        .from(scoreEvents)
        .where(eq(scoreEvents.id, rejectedAdjustmentId)),
    ).resolves.toEqual([]);
  });

  it("désactive, révoque la session et journalise une seule fois", async () => {
    const disabled = await disableAdminPlayer(playerIds[0], adminId, {
      repository: postgresAdminPlayerManagementRepository,
      now: () => now,
    });
    expect(disabled.status).toBe("DISABLED");

    const [sessionRows, auditRows] = await db.batch([
      db
        .select({ revokedAt: playerSessions.revokedAt })
        .from(playerSessions)
        .where(eq(playerSessions.id, playerSessionId)),
      db
        .select({ action: auditLogs.action, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, playerIds[0])),
    ]);
    expect(sessionRows[0]?.revokedAt).toEqual(now);
    expect(auditRows).toEqual([
      expect.objectContaining({
        action: "PLAYER_DISABLED",
        metadata: expect.objectContaining({ publicCode, revokedSessionCount: 1 }),
      }),
    ]);

    await expect(
      disableAdminPlayer(playerIds[0], adminId, {
        repository: postgresAdminPlayerManagementRepository,
        now: () => now,
      }),
    ).rejects.toMatchObject({ name: "AdminPlayerAlreadyDisabledError" });
  });
});
