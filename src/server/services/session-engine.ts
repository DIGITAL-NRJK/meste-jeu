import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  quizSessionInputSchema,
  type QuizSessionInput,
  sessionLineupSchema,
} from "@/lib/validation/session-engine";

export type QuizMode = "DISCOVERY" | "LIVE";
export type QuizSessionStatus =
  | "DRAFT"
  | "READY"
  | "LIVE"
  | "FINISHED"
  | "CANCELED";
export type SessionQuestionStatus =
  | "PENDING"
  | "OPEN"
  | "CLOSED"
  | "REVEALED"
  | "CANCELED";

export type SessionQuestionDetail = {
  id: string;
  questionId: string;
  questionText: string;
  questionStatus: "DRAFT" | "REVIEW" | "VALIDATED" | "ARCHIVED";
  position: number;
  durationSeconds: number;
  status: SessionQuestionStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  revealedAt: Date | null;
  canceledAt: Date | null;
};

export type QuizSessionDetail = {
  id: string;
  eventId: string;
  eventSlug: string;
  eventName: string;
  name: string;
  slug: string;
  mode: QuizMode;
  status: QuizSessionStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  resetScore: boolean;
  createdAt: Date;
  updatedAt: Date;
  questions: SessionQuestionDetail[];
};

export type PublicQuestionOption = {
  id: string;
  label: string;
  text: string;
};

type PublicCurrentQuestionBase = {
  id: string;
  position: number;
  totalQuestions: number;
  durationSeconds: number;
  status: SessionQuestionStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  revealedAt: Date | null;
  canceledAt: Date | null;
  acceptingAnswers: boolean;
  category: { name: string; slug: string };
  questionText: string;
  difficulty: number;
  mediaType: "TEXT" | "IMAGE";
  mediaUrl: string | null;
  options: PublicQuestionOption[];
};

export type PublicCurrentQuestion =
  | (PublicCurrentQuestionBase & {
      status: "PENDING" | "OPEN" | "CLOSED" | "CANCELED";
    })
  | (PublicCurrentQuestionBase & {
      status: "REVEALED";
      reveal: {
        correctOptionId: string;
        explanation: string;
      };
    });

export type PublicSessionState = {
  session: {
    id: string;
    name: string;
    slug: string;
    mode: QuizMode;
    status: QuizSessionStatus;
    startsAt: Date | null;
    endsAt: Date | null;
  };
  currentQuestion: PublicCurrentQuestion | null;
};

export type PersistQuizSession = QuizSessionInput & {
  id: string;
  slug: string;
  actorAdminId: string;
  now: Date;
};

export type PersistSessionLineupItem = {
  id: string;
  questionId: string;
  position: number;
  durationSeconds: number;
};

export type ConfigureLineupOutcome =
  | "configured"
  | "not_found"
  | "invalid_status"
  | "invalid_questions";

export type SessionTransitionOutcome =
  | "transitioned"
  | "not_found"
  | "invalid_status"
  | "no_questions"
  | "unvalidated_questions"
  | "question_still_open"
  | "unrevealed_question"
  | "no_pending_question"
  | "no_open_question"
  | "no_closed_question"
  | "unresolved_questions"
  | "session_question_not_found"
  | "question_already_canceled";

export interface SessionEngineRepository {
  createSession(input: PersistQuizSession): Promise<QuizSessionDetail>;
  getSession(sessionId: string): Promise<QuizSessionDetail | null>;
  configureLineup(
    sessionId: string,
    items: PersistSessionLineupItem[],
    now: Date,
  ): Promise<ConfigureLineupOutcome>;
  markReady(
    sessionId: string,
    now: Date,
  ): Promise<SessionTransitionOutcome>;
  startSession(
    sessionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<SessionTransitionOutcome>;
  openNextQuestion(
    sessionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<SessionTransitionOutcome>;
  closeCurrentQuestion(
    sessionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<SessionTransitionOutcome>;
  revealCurrentQuestion(
    sessionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<SessionTransitionOutcome>;
  cancelSessionQuestion(
    sessionQuestionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<{
    outcome: SessionTransitionOutcome;
    sessionId?: string;
  }>;
  finishSession(
    sessionId: string,
    actorAdminId: string,
    now: Date,
  ): Promise<SessionTransitionOutcome>;
  getPublicState(
    sessionId: string,
    now: Date,
  ): Promise<PublicSessionState | null>;
}

export class SessionInputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid session engine input");
    this.name = "SessionInputError";
  }
}

export class SessionNotFoundError extends Error {
  constructor() {
    super("Quiz session not found");
    this.name = "SessionNotFoundError";
  }
}

export class SessionSlugConflictError extends Error {
  constructor() {
    super("Quiz session slug already exists for this event");
    this.name = "SessionSlugConflictError";
  }
}

export class SessionEventNotFoundError extends Error {
  constructor() {
    super("Quiz session event not found");
    this.name = "SessionEventNotFoundError";
  }
}

export class SessionInvalidStatusError extends Error {
  constructor() {
    super("Quiz session status does not allow this operation");
    this.name = "SessionInvalidStatusError";
  }
}

export class SessionLineupError extends Error {
  constructor(readonly reason: "invalid_questions") {
    super(`Invalid quiz session lineup: ${reason}`);
    this.name = "SessionLineupError";
  }
}

export class SessionTransitionError extends Error {
  constructor(
    readonly reason: Exclude<
      SessionTransitionOutcome,
      "transitioned" | "not_found" | "invalid_status"
    >,
  ) {
    super(`Quiz session transition refused: ${reason}`);
    this.name = "SessionTransitionError";
  }
}

export class SessionPersistenceError extends Error {
  constructor(readonly kind: "event_not_found" | "slug_conflict") {
    super(`Quiz session persistence error: ${kind}`);
    this.name = "SessionPersistenceError";
  }
}

type SessionEngineDependencies = {
  repository: SessionEngineRepository;
  now?: () => Date;
  createId?: () => string;
};

export function normalizeSessionSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseInput<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) {
    throw new SessionInputError(result.error.issues);
  }

  return result.data;
}

function parseId(value: string): string {
  return parseInput(z.uuid().safeParse(value));
}

function assertActorId(actorAdminId: string): void {
  parseId(actorAdminId);
}

function mapPersistenceError(error: unknown): never {
  if (error instanceof SessionPersistenceError) {
    if (error.kind === "slug_conflict") {
      throw new SessionSlugConflictError();
    }

    throw new SessionEventNotFoundError();
  }

  throw error;
}

async function requireSession(
  sessionId: string,
  repository: SessionEngineRepository,
): Promise<QuizSessionDetail> {
  const session = await repository.getSession(sessionId);

  if (!session) {
    throw new SessionNotFoundError();
  }

  return session;
}

export async function createQuizSession(
  input: unknown,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
): Promise<QuizSessionDetail> {
  assertActorId(actorAdminId);
  const session = parseInput(quizSessionInputSchema.safeParse(input));
  const slug = normalizeSessionSlug(session.name);

  if (!slug) {
    throw new SessionInputError([]);
  }

  try {
    return await dependencies.repository.createSession({
      ...session,
      id: dependencies.createId?.() ?? randomUUID(),
      slug,
      actorAdminId,
      now: dependencies.now?.() ?? new Date(),
    });
  } catch (error) {
    return mapPersistenceError(error);
  }
}

export async function getQuizSession(
  sessionId: string,
  repository: SessionEngineRepository,
): Promise<QuizSessionDetail> {
  return requireSession(parseId(sessionId), repository);
}

export async function configureSessionLineup(
  sessionId: string,
  input: unknown,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
): Promise<QuizSessionDetail> {
  assertActorId(actorAdminId);
  const id = parseId(sessionId);
  const lineup = parseInput(sessionLineupSchema.safeParse(input));
  const createId = dependencies.createId ?? randomUUID;
  const outcome = await dependencies.repository.configureLineup(
    id,
    lineup.map((item, index) => ({
      id: createId(),
      questionId: item.questionId,
      durationSeconds: item.durationSeconds,
      position: index + 1,
    })),
    dependencies.now?.() ?? new Date(),
  );

  if (outcome === "not_found") {
    throw new SessionNotFoundError();
  }

  if (outcome === "invalid_status") {
    throw new SessionInvalidStatusError();
  }

  if (outcome === "invalid_questions") {
    throw new SessionLineupError(outcome);
  }

  return requireSession(id, dependencies.repository);
}

function handleTransitionOutcome(outcome: SessionTransitionOutcome): void {
  if (outcome === "transitioned") {
    return;
  }

  if (outcome === "not_found") {
    throw new SessionNotFoundError();
  }

  if (outcome === "invalid_status") {
    throw new SessionInvalidStatusError();
  }

  throw new SessionTransitionError(outcome);
}

async function transitionSession(
  sessionId: string,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
  transition: (
    sessionId: string,
    actorAdminId: string,
    now: Date,
  ) => Promise<SessionTransitionOutcome>,
): Promise<QuizSessionDetail> {
  assertActorId(actorAdminId);
  const id = parseId(sessionId);
  const outcome = await transition(
    id,
    actorAdminId,
    dependencies.now?.() ?? new Date(),
  );
  handleTransitionOutcome(outcome);

  return requireSession(id, dependencies.repository);
}

export async function markSessionReady(
  sessionId: string,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
): Promise<QuizSessionDetail> {
  assertActorId(actorAdminId);
  const id = parseId(sessionId);
  const outcome = await dependencies.repository.markReady(
    id,
    dependencies.now?.() ?? new Date(),
  );
  handleTransitionOutcome(outcome);

  return requireSession(id, dependencies.repository);
}

export function startQuizSession(
  sessionId: string,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
) {
  return transitionSession(
    sessionId,
    actorAdminId,
    dependencies,
    dependencies.repository.startSession.bind(dependencies.repository),
  );
}

export function openNextSessionQuestion(
  sessionId: string,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
) {
  return transitionSession(
    sessionId,
    actorAdminId,
    dependencies,
    dependencies.repository.openNextQuestion.bind(dependencies.repository),
  );
}

export function closeCurrentSessionQuestion(
  sessionId: string,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
) {
  return transitionSession(
    sessionId,
    actorAdminId,
    dependencies,
    dependencies.repository.closeCurrentQuestion.bind(dependencies.repository),
  );
}

export function revealCurrentSessionQuestion(
  sessionId: string,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
) {
  return transitionSession(
    sessionId,
    actorAdminId,
    dependencies,
    dependencies.repository.revealCurrentQuestion.bind(dependencies.repository),
  );
}

export async function cancelSessionQuestion(
  sessionQuestionId: string,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
): Promise<QuizSessionDetail> {
  assertActorId(actorAdminId);
  const id = parseId(sessionQuestionId);
  const result = await dependencies.repository.cancelSessionQuestion(
    id,
    actorAdminId,
    dependencies.now?.() ?? new Date(),
  );
  handleTransitionOutcome(result.outcome);

  if (!result.sessionId) {
    throw new SessionNotFoundError();
  }

  return requireSession(result.sessionId, dependencies.repository);
}

export function finishQuizSession(
  sessionId: string,
  actorAdminId: string,
  dependencies: SessionEngineDependencies,
) {
  return transitionSession(
    sessionId,
    actorAdminId,
    dependencies,
    dependencies.repository.finishSession.bind(dependencies.repository),
  );
}

export async function getPublicSessionState(
  sessionId: string,
  dependencies: Pick<SessionEngineDependencies, "repository" | "now">,
): Promise<PublicSessionState> {
  const state = await dependencies.repository.getPublicState(
    parseId(sessionId),
    dependencies.now?.() ?? new Date(),
  );

  if (!state) {
    throw new SessionNotFoundError();
  }

  return state;
}
