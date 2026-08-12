import { randomUUID } from "node:crypto";

import { z } from "zod";

import { hashPlayerSessionToken } from "@/lib/auth/player-session";
import {
  answerSubmissionSchema,
  type AnswerSubmissionInput,
} from "@/lib/validation/answer";

export type AcceptedAnswer = {
  id: string;
  receivedAt: Date;
  responseTimeMs: number;
};

export type AnswerScoreBreakdown = {
  answerPoints: number;
  difficultyBonus: number;
  speedBonus: number;
  streakBonus: number;
};

export type PlayerAnswerResult =
  | {
      status: "PENDING" | "OPEN" | "CLOSED";
      answerSubmitted: boolean;
    }
  | {
      status: "CANCELED";
      answerSubmitted: boolean;
      totalPoints: 0;
    }
  | {
      status: "REVEALED";
      answerSubmitted: boolean;
      selectedOptionId: string | null;
      correctOptionId: string;
      isCorrect: boolean | null;
      explanation: string;
      score: AnswerScoreBreakdown;
      totalPoints: number;
    };

export type PersistAnswerInput = AnswerSubmissionInput & {
  answerId: string;
  sessionQuestionId: string;
  playerTokenHash: string;
  now: Date;
};

export type SubmitAnswerOutcome =
  | { outcome: "accepted"; answer: AcceptedAnswer }
  | { outcome: "unauthenticated" }
  | { outcome: "not_found" }
  | { outcome: "not_open" }
  | { outcome: "expired" }
  | { outcome: "canceled" }
  | { outcome: "invalid_option" }
  | { outcome: "already_answered" };

export type GetAnswerResultOutcome =
  | { outcome: "found"; result: PlayerAnswerResult }
  | { outcome: "unauthenticated" }
  | { outcome: "not_found" };

export interface AnswerScoringRepository {
  submitAnswer(input: PersistAnswerInput): Promise<SubmitAnswerOutcome>;
  getAnswerResult(
    sessionQuestionId: string,
    playerTokenHash: string,
    now: Date,
  ): Promise<GetAnswerResultOutcome>;
}

export class AnswerInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid answer input");
    this.name = "AnswerInputError";
  }
}

export class PlayerUnauthenticatedError extends Error {
  constructor() {
    super("Player session is not authenticated");
    this.name = "PlayerUnauthenticatedError";
  }
}

export class SessionQuestionNotFoundError extends Error {
  constructor() {
    super("Session question not found for this player");
    this.name = "SessionQuestionNotFoundError";
  }
}

export class AnswerNotAcceptedError extends Error {
  constructor(readonly reason: "not_open" | "expired" | "canceled") {
    super(`Answer not accepted: ${reason}`);
    this.name = "AnswerNotAcceptedError";
  }
}

export class AnswerOptionInvalidError extends Error {
  constructor() {
    super("Answer option does not belong to the question");
    this.name = "AnswerOptionInvalidError";
  }
}

export class AnswerAlreadySubmittedError extends Error {
  constructor() {
    super("An answer was already submitted for this occurrence");
    this.name = "AnswerAlreadySubmittedError";
  }
}

type AnswerScoringDependencies = {
  repository: AnswerScoringRepository;
  sessionSecret: string;
  now?: () => Date;
  createId?: () => string;
};

function parseInput<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) {
    throw new AnswerInputError(result.error.issues);
  }

  return result.data;
}

function parseId(value: string): string {
  return parseInput(z.uuid().safeParse(value));
}

function assertToken(token: string): void {
  const result = z.string().min(1).safeParse(token);

  if (!result.success) {
    throw new PlayerUnauthenticatedError();
  }
}

function getPlayerTokenHash(token: string, sessionSecret: string): string {
  assertToken(token);
  return hashPlayerSessionToken(token, sessionSecret);
}

function handleSubmitOutcome(outcome: SubmitAnswerOutcome): AcceptedAnswer {
  switch (outcome.outcome) {
    case "accepted":
      return outcome.answer;
    case "unauthenticated":
      throw new PlayerUnauthenticatedError();
    case "not_found":
      throw new SessionQuestionNotFoundError();
    case "invalid_option":
      throw new AnswerOptionInvalidError();
    case "already_answered":
      throw new AnswerAlreadySubmittedError();
    case "not_open":
    case "expired":
    case "canceled":
      throw new AnswerNotAcceptedError(outcome.outcome);
  }
}

export async function submitPlayerAnswer(
  sessionQuestionId: string,
  input: unknown,
  playerToken: string,
  dependencies: AnswerScoringDependencies,
): Promise<AcceptedAnswer> {
  const occurrenceId = parseId(sessionQuestionId);
  const answer = parseInput(answerSubmissionSchema.safeParse(input));
  const outcome = await dependencies.repository.submitAnswer({
    answerId: dependencies.createId?.() ?? randomUUID(),
    sessionQuestionId: occurrenceId,
    optionId: answer.optionId,
    playerTokenHash: getPlayerTokenHash(
      playerToken,
      dependencies.sessionSecret,
    ),
    now: dependencies.now?.() ?? new Date(),
  });

  return handleSubmitOutcome(outcome);
}

export async function getPlayerAnswerResult(
  sessionQuestionId: string,
  playerToken: string,
  dependencies: Pick<
    AnswerScoringDependencies,
    "repository" | "sessionSecret" | "now"
  >,
): Promise<PlayerAnswerResult> {
  const outcome = await dependencies.repository.getAnswerResult(
    parseId(sessionQuestionId),
    getPlayerTokenHash(playerToken, dependencies.sessionSecret),
    dependencies.now?.() ?? new Date(),
  );

  if (outcome.outcome === "unauthenticated") {
    throw new PlayerUnauthenticatedError();
  }

  if (outcome.outcome === "not_found") {
    throw new SessionQuestionNotFoundError();
  }

  return outcome.result;
}
