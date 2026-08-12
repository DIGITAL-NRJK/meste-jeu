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
import { hashPlayerSessionToken } from "../../src/lib/auth/player-session";
import { getDb } from "../../src/lib/db/client";
import { postgresAnswerScoringRepository } from "../../src/server/repositories/answer-scoring-repository";
import { postgresPlayerRepository } from "../../src/server/repositories/player-repository";
import { postgresSessionEngineRepository } from "../../src/server/repositories/session-engine-repository";
import {
  AnswerAlreadySubmittedError,
  AnswerNotAcceptedError,
  getPlayerAnswerResult,
  submitPlayerAnswer,
} from "../../src/server/services/answer-scoring";
import { getCurrentPlayer } from "../../src/server/services/player-registration";
import { cancelSessionQuestion } from "../../src/server/services/session-engine";

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
const categoryId = randomUUID();
const quizSessionId = randomUUID();
const playerId = randomUUID();
const playerSessionId = randomUUID();
const playerToken = `integration-answer-${randomUUID()}`;
const sessionSecret = process.env.SESSION_SECRET ?? "";
const questionIds = [randomUUID(), randomUUID(), randomUUID()];
const occurrenceIds = [randomUUID(), randomUUID(), randomUUID()];
const correctOptionIds = [randomUUID(), randomUUID(), randomUUID()];
const wrongOptionIds = [randomUUID(), randomUUID(), randomUUID()];
const baseTime = new Date("2026-08-15T18:30:00.000Z");

function at(seconds: number) {
  return new Date(baseTime.getTime() + seconds * 1_000);
}

describe("answer scoring with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(adminUsers).values({
      id: actorAdminId,
      email: `integration-answer-${randomUUID()}@example.com`,
      passwordHash: "integration-test-only",
      displayName: "Admin intégration scoring",
    });
    await db.insert(events).values({
      id: eventId,
      slug: `integration-answer-${randomUUID()}`,
      name: "Événement d’intégration du scoring",
      startsAt: at(-3_600),
      endsAt: at(3_600),
      timezone: "Africa/Brazzaville",
      status: "LIVE",
    });
    await db.insert(categories).values({
      id: categoryId,
      name: `Scoring ${randomUUID()}`,
      slug: `scoring-${randomUUID()}`,
    });
    await db.insert(questions).values(
      questionIds.map((id, index) => ({
        id,
        categoryId,
        questionText: `Question scoring ${index + 1} sur la République du Congo ?`,
        explanation: `Explication scoring ${index + 1}.`,
        difficulty: index === 0 ? 4 : 1,
        status: "VALIDATED" as const,
        validatedAt: at(-600),
        validatedBy: actorAdminId,
      })),
    );
    await db.insert(questionOptions).values(
      questionIds.flatMap((questionId, index) => [
        {
          id: correctOptionIds[index]!,
          questionId,
          label: "A",
          text: `Bonne réponse ${index + 1}`,
          isCorrect: true,
          position: 1,
        },
        {
          id: wrongOptionIds[index]!,
          questionId,
          label: "B",
          text: `Mauvaise réponse ${index + 1}`,
          isCorrect: false,
          position: 2,
        },
      ]),
    );
    await db.insert(quizSessions).values({
      id: quizSessionId,
      eventId,
      name: "Session intégration scoring",
      slug: `session-scoring-${randomUUID()}`,
      mode: "LIVE",
      status: "LIVE",
      startsAt: at(0),
    });
    await db.insert(sessionQuestions).values(
      occurrenceIds.map((id, index) => ({
        id,
        quizSessionId,
        questionId: questionIds[index]!,
        position: index + 1,
        durationSeconds: index === 0 ? 60 : 10,
        status: index === 0 ? ("OPEN" as const) : ("PENDING" as const),
        opensAt: index === 0 ? at(0) : null,
        closesAt: index === 0 ? at(60) : null,
      })),
    );
    await db.insert(players).values({
      id: playerId,
      eventId,
      publicCode: `IT-${randomUUID()}`,
      nickname: `Makaya Scoring ${randomUUID()}`,
      currentStreak: 2,
    });
    await db.insert(playerSessions).values({
      id: playerSessionId,
      playerId,
      tokenHash: hashPlayerSessionToken(playerToken, sessionSecret),
      createdAt: at(-60),
      expiresAt: at(3_600),
    });
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, actorAdminId));
    await db.delete(scoreEvents).where(eq(scoreEvents.playerId, playerId));
    await db.delete(answers).where(eq(answers.playerId, playerId));
    await db
      .delete(playerSessions)
      .where(eq(playerSessions.playerId, playerId));
    await db.delete(players).where(eq(players.id, playerId));
    await db
      .delete(sessionQuestions)
      .where(eq(sessionQuestions.quizSessionId, quizSessionId));
    await db.delete(quizSessions).where(eq(quizSessions.id, quizSessionId));
    await db
      .delete(questionOptions)
      .where(inArray(questionOptions.questionId, questionIds));
    await db.delete(questions).where(inArray(questions.id, questionIds));
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(events).where(eq(events.id, eventId));
    await db.delete(adminUsers).where(eq(adminUsers.id, actorAdminId));
  });

  it("score atomiquement, bloque les doublons et invalide une question annulée", async () => {
    const firstAnswer = await submitPlayerAnswer(
      occurrenceIds[0]!,
      { optionId: correctOptionIds[0]! },
      playerToken,
      {
        repository: postgresAnswerScoringRepository,
        sessionSecret,
        now: () => at(30),
      },
    );

    expect(firstAnswer.responseTimeMs).toBe(30_000);
    expect(firstAnswer).not.toHaveProperty("isCorrect");
    await expect(
      submitPlayerAnswer(
        occurrenceIds[0]!,
        { optionId: correctOptionIds[0]! },
        playerToken,
        {
          repository: postgresAnswerScoringRepository,
          sessionSecret,
          now: () => at(31),
        },
      ),
    ).rejects.toBeInstanceOf(AnswerAlreadySubmittedError);

    const hidden = await getPlayerAnswerResult(
      occurrenceIds[0]!,
      playerToken,
      {
        repository: postgresAnswerScoringRepository,
        sessionSecret,
        now: () => at(31),
      },
    );
    expect(hidden).toEqual({ status: "OPEN", answerSubmitted: true });
    expect(JSON.stringify(hidden)).not.toContain("correctOptionId");

    const activeScores = await db
      .select({ type: scoreEvents.type, points: scoreEvents.points })
      .from(scoreEvents)
      .where(eq(scoreEvents.sessionQuestionId, occurrenceIds[0]!));
    expect(activeScores).toEqual(
      expect.arrayContaining([
        { type: "ANSWER_CORRECT", points: 100 },
        { type: "DIFFICULTY_BONUS", points: 60 },
        { type: "SPEED_BONUS", points: 15 },
        { type: "STREAK_BONUS", points: 20 },
      ]),
    );

    await db
      .update(sessionQuestions)
      .set({ status: "REVEALED", revealedAt: at(61) })
      .where(eq(sessionQuestions.id, occurrenceIds[0]!));
    const revealed = await getPlayerAnswerResult(
      occurrenceIds[0]!,
      playerToken,
      {
        repository: postgresAnswerScoringRepository,
        sessionSecret,
        now: () => at(61),
      },
    );
    expect(revealed).toMatchObject({
      status: "REVEALED",
      isCorrect: true,
      correctOptionId: correctOptionIds[0],
      totalPoints: 195,
      score: {
        answerPoints: 100,
        difficultyBonus: 60,
        speedBonus: 15,
        streakBonus: 20,
      },
    });
    await expect(
      getCurrentPlayer(playerToken, {
        repository: postgresPlayerRepository,
        sessionSecret,
        now: () => at(61),
      }),
    ).resolves.toMatchObject({
      player: { totalPoints: 195 },
    });

    await cancelSessionQuestion(occurrenceIds[0]!, actorAdminId, {
      repository: postgresSessionEngineRepository,
      now: () => at(62),
    });
    const voidedScores = await db
      .select({ voidedAt: scoreEvents.voidedAt })
      .from(scoreEvents)
      .where(eq(scoreEvents.sessionQuestionId, occurrenceIds[0]!));
    expect(voidedScores).toHaveLength(4);
    expect(voidedScores.every((score) => score.voidedAt?.getTime() === at(62).getTime())).toBe(true);
    await expect(
      getPlayerAnswerResult(occurrenceIds[0]!, playerToken, {
        repository: postgresAnswerScoringRepository,
        sessionSecret,
        now: () => at(62),
      }),
    ).resolves.toEqual({
      status: "CANCELED",
      answerSubmitted: true,
      totalPoints: 0,
    });
    await expect(
      getCurrentPlayer(playerToken, {
        repository: postgresPlayerRepository,
        sessionSecret,
        now: () => at(62),
      }),
    ).resolves.toMatchObject({
      player: { totalPoints: 0 },
    });

    await db
      .update(sessionQuestions)
      .set({ status: "OPEN", opensAt: at(120), closesAt: at(130) })
      .where(eq(sessionQuestions.id, occurrenceIds[1]!));
    const concurrent = await Promise.allSettled([
      submitPlayerAnswer(
        occurrenceIds[1]!,
        { optionId: wrongOptionIds[1]! },
        playerToken,
        {
          repository: postgresAnswerScoringRepository,
          sessionSecret,
          now: () => at(125),
        },
      ),
      submitPlayerAnswer(
        occurrenceIds[1]!,
        { optionId: wrongOptionIds[1]! },
        playerToken,
        {
          repository: postgresAnswerScoringRepository,
          sessionSecret,
          now: () => at(125),
        },
      ),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      concurrent.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { constructor: AnswerAlreadySubmittedError } });

    const [storedPlayer] = await db
      .select({ currentStreak: players.currentStreak })
      .from(players)
      .where(eq(players.id, playerId));
    expect(storedPlayer?.currentStreak).toBe(0);

    await cancelSessionQuestion(occurrenceIds[1]!, actorAdminId, {
      repository: postgresSessionEngineRepository,
      now: () => at(131),
    });
    await db
      .update(sessionQuestions)
      .set({ status: "OPEN", opensAt: at(140), closesAt: at(150) })
      .where(eq(sessionQuestions.id, occurrenceIds[2]!));

    await expect(
      submitPlayerAnswer(
        occurrenceIds[2]!,
        { optionId: correctOptionIds[2]! },
        playerToken,
        {
          repository: postgresAnswerScoringRepository,
          sessionSecret,
          now: () => at(150),
        },
      ),
    ).rejects.toMatchObject({
      constructor: AnswerNotAcceptedError,
      reason: "expired",
    });
  });
});
