import { describe, expect, it, vi } from "vitest";

import { hashPlayerSessionToken } from "../../src/lib/auth/player-session";
import {
  AnswerAlreadySubmittedError,
  AnswerInputError,
  AnswerNotAcceptedError,
  AnswerOptionInvalidError,
  getPlayerAnswerResult,
  PlayerUnauthenticatedError,
  type AnswerScoringRepository,
  SessionQuestionNotFoundError,
  submitPlayerAnswer,
} from "../../src/server/services/answer-scoring";

const sessionQuestionId = "00000000-0000-4000-8000-000000000001";
const optionId = "00000000-0000-4000-8000-000000000002";
const answerId = "00000000-0000-4000-8000-000000000003";
const correctOptionId = "00000000-0000-4000-8000-000000000004";
const now = new Date("2026-08-15T18:30:00.000Z");
const sessionSecret = "session-secret-with-at-least-32-characters";
const playerToken = "raw-player-session-token";

function createRepository(
  overrides: Partial<AnswerScoringRepository> = {},
): AnswerScoringRepository {
  return {
    submitAnswer: vi.fn(async () => ({
      outcome: "accepted" as const,
      answer: { id: answerId, receivedAt: now, responseTimeMs: 1_500 },
    })),
    getAnswerResult: vi.fn(async () => ({
      outcome: "found" as const,
      result: { status: "OPEN" as const, answerSubmitted: true },
    })),
    ...overrides,
  };
}

describe("answer scoring service", () => {
  it("hachure le jeton et ne retourne aucune information de correction", async () => {
    const repository = createRepository();

    const answer = await submitPlayerAnswer(
      sessionQuestionId,
      { optionId },
      playerToken,
      {
        repository,
        sessionSecret,
        now: () => now,
        createId: () => answerId,
      },
    );

    expect(repository.submitAnswer).toHaveBeenCalledWith({
      answerId,
      sessionQuestionId,
      optionId,
      playerTokenHash: hashPlayerSessionToken(playerToken, sessionSecret),
      now,
    });
    expect(answer).toEqual({ id: answerId, receivedAt: now, responseTimeMs: 1_500 });
    expect(answer).not.toHaveProperty("isCorrect");
    expect(answer).not.toHaveProperty("points");
  });

  it("refuse les identifiants invalides avant tout accès au repository", async () => {
    const repository = createRepository();

    await expect(
      submitPlayerAnswer("invalid", { optionId }, playerToken, {
        repository,
        sessionSecret,
      }),
    ).rejects.toBeInstanceOf(AnswerInputError);
    await expect(
      submitPlayerAnswer(sessionQuestionId, { optionId: "invalid" }, playerToken, {
        repository,
        sessionSecret,
      }),
    ).rejects.toBeInstanceOf(AnswerInputError);
    expect(repository.submitAnswer).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthenticated", PlayerUnauthenticatedError],
    ["not_found", SessionQuestionNotFoundError],
    ["invalid_option", AnswerOptionInvalidError],
    ["already_answered", AnswerAlreadySubmittedError],
  ] as const)("traduit l’issue %s en erreur métier", async (outcome, ErrorType) => {
    const repository = createRepository({
      submitAnswer: vi.fn(async () => ({ outcome })),
    });

    await expect(
      submitPlayerAnswer(sessionQuestionId, { optionId }, playerToken, {
        repository,
        sessionSecret,
      }),
    ).rejects.toBeInstanceOf(ErrorType);
  });

  it.each(["not_open", "expired", "canceled"] as const)(
    "conserve la raison métier %s",
    async (outcome) => {
      const repository = createRepository({
        submitAnswer: vi.fn(async () => ({ outcome })),
      });

      await expect(
        submitPlayerAnswer(sessionQuestionId, { optionId }, playerToken, {
          repository,
          sessionSecret,
        }),
      ).rejects.toMatchObject({
        constructor: AnswerNotAcceptedError,
        reason: outcome,
      });
    },
  );

  it("ne révèle le résultat complet qu’après la phase REVEALED", async () => {
    const closedRepository = createRepository({
      getAnswerResult: vi.fn(async () => ({
        outcome: "found" as const,
        result: { status: "CLOSED" as const, answerSubmitted: true },
      })),
    });
    const revealedRepository = createRepository({
      getAnswerResult: vi.fn(async () => ({
        outcome: "found" as const,
        result: {
          status: "REVEALED" as const,
          answerSubmitted: true,
          selectedOptionId: optionId,
          correctOptionId,
          isCorrect: false,
          explanation: "Explication publique après révélation.",
          score: {
            answerPoints: 0,
            difficultyBonus: 0,
            speedBonus: 0,
            streakBonus: 0,
          },
          totalPoints: 0,
        },
      })),
    });

    const closed = await getPlayerAnswerResult(sessionQuestionId, playerToken, {
      repository: closedRepository,
      sessionSecret,
      now: () => now,
    });
    const revealed = await getPlayerAnswerResult(sessionQuestionId, playerToken, {
      repository: revealedRepository,
      sessionSecret,
      now: () => now,
    });

    expect(closed).toEqual({ status: "CLOSED", answerSubmitted: true });
    expect(closed).not.toHaveProperty("correctOptionId");
    expect(revealed).toMatchObject({
      status: "REVEALED",
      correctOptionId,
      isCorrect: false,
      totalPoints: 0,
    });
  });
});
