import { describe, expect, it, vi } from "vitest";

import {
  cancelSessionQuestion,
  configureSessionLineup,
  createQuizSession,
  getPublicSessionState,
  markSessionReady,
  normalizeSessionSlug,
  openNextSessionQuestion,
  resetQuizSessionToDraft,
  type PersistQuizSession,
  type PersistSessionLineupItem,
  type PublicSessionState,
  type QuizSessionDetail,
  type SessionEngineRepository,
  SessionInvalidStatusError,
  SessionLineupError,
  SessionNotFoundError,
  SessionPersistenceError,
  SessionSlugConflictError,
  SessionTransitionError,
} from "../../src/server/services/session-engine";

const actorAdminId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const questionId = "00000000-0000-4000-8000-000000000004";
const sessionQuestionId = "00000000-0000-4000-8000-000000000005";
const now = new Date("2026-08-15T18:30:00.000Z");

function sessionDetail(
  input?: Partial<QuizSessionDetail>,
): QuizSessionDetail {
  return {
    id: sessionId,
    eventId,
    eventSlug: "heritage-congo-2026",
    eventName: "Héritage Congo 2026",
    name: "Grand Quiz de l’Indépendance",
    slug: "grand-quiz-de-l-independance",
    mode: "LIVE",
    status: "DRAFT",
    startsAt: null,
    endsAt: null,
    resetScore: false,
    createdAt: now,
    updatedAt: now,
    questions: [],
    ...input,
  };
}

function createRepository(
  overrides: Partial<SessionEngineRepository> = {},
): SessionEngineRepository {
  return {
    createSession: vi.fn(async () => sessionDetail()),
    getSession: vi.fn(async () => sessionDetail()),
    configureLineup: vi.fn(async () => "configured" as const),
    markReady: vi.fn(async () => "transitioned" as const),
    resetToDraft: vi.fn(async () => "transitioned" as const),
    startSession: vi.fn(async () => "transitioned" as const),
    openNextQuestion: vi.fn(async () => "transitioned" as const),
    closeCurrentQuestion: vi.fn(async () => "transitioned" as const),
    revealCurrentQuestion: vi.fn(async () => "transitioned" as const),
    cancelSessionQuestion: vi.fn(async () => ({
      outcome: "transitioned" as const,
      sessionId,
    })),
    finishSession: vi.fn(async () => "transitioned" as const),
    getPublicState: vi.fn(async () => null),
    ...overrides,
  };
}

describe("session engine service", () => {
  it("normalise un nom de session sans perdre la terminologie Congo", () => {
    expect(normalizeSessionSlug("Grand Quiz — Congo–Ghana")).toBe(
      "grand-quiz-congo-ghana",
    );
  });

  it("crée un brouillon auditable avec un slug stable", async () => {
    let persisted: PersistQuizSession | undefined;
    const repository = createRepository({
      createSession: vi.fn(async (input) => {
        persisted = input;
        return sessionDetail({ id: input.id, slug: input.slug });
      }),
    });

    const session = await createQuizSession(
      {
        eventId,
        name: "Grand Quiz de l’Indépendance",
        mode: "LIVE",
      },
      actorAdminId,
      {
        repository,
        now: () => now,
        createId: () => sessionId,
      },
    );

    expect(session.status).toBe("DRAFT");
    expect(persisted).toMatchObject({
      id: sessionId,
      slug: "grand-quiz-de-l-independance",
      actorAdminId,
      now,
    });
  });

  it("traduit un conflit de slug en erreur métier", async () => {
    const repository = createRepository({
      createSession: vi.fn(async () => {
        throw new SessionPersistenceError("slug_conflict");
      }),
    });

    await expect(
      createQuizSession(
        { eventId, name: "Grand Quiz", mode: "LIVE" },
        actorAdminId,
        { repository },
      ),
    ).rejects.toBeInstanceOf(SessionSlugConflictError);
  });

  it("transforme la configuration en positions serveur", async () => {
    let persisted: PersistSessionLineupItem[] = [];
    const repository = createRepository({
      configureLineup: vi.fn(async (_id, items) => {
        persisted = items;
        return "configured" as const;
      }),
    });

    await configureSessionLineup(
      sessionId,
      [{ questionId, durationSeconds: 45 }],
      actorAdminId,
      {
        repository,
        now: () => now,
        createId: () => sessionQuestionId,
      },
    );

    expect(persisted).toEqual([
      {
        id: sessionQuestionId,
        questionId,
        position: 1,
        durationSeconds: 45,
      },
    ]);
  });

  it("refuse une question non validée et une session non éditable", async () => {
    const invalidQuestions = createRepository({
      configureLineup: vi.fn(async () => "invalid_questions" as const),
    });
    const invalidStatus = createRepository({
      configureLineup: vi.fn(async () => "invalid_status" as const),
    });

    await expect(
      configureSessionLineup(
        sessionId,
        [{ questionId, durationSeconds: 45 }],
        actorAdminId,
        { repository: invalidQuestions },
      ),
    ).rejects.toBeInstanceOf(SessionLineupError);
    await expect(
      configureSessionLineup(
        sessionId,
        [{ questionId, durationSeconds: 45 }],
        actorAdminId,
        { repository: invalidStatus },
      ),
    ).rejects.toBeInstanceOf(SessionInvalidStatusError);
  });

  it("bloque la préparation sans question et une seconde ouverture", async () => {
    const noQuestions = createRepository({
      markReady: vi.fn(async () => "no_questions" as const),
    });
    const alreadyOpen = createRepository({
      openNextQuestion: vi.fn(async () => "question_still_open" as const),
    });

    await expect(
      markSessionReady(sessionId, actorAdminId, {
        repository: noQuestions,
      }),
    ).rejects.toMatchObject({
      constructor: SessionTransitionError,
      reason: "no_questions",
    });
    await expect(
      openNextSessionQuestion(sessionId, actorAdminId, {
        repository: alreadyOpen,
      }),
    ).rejects.toMatchObject({ reason: "question_still_open" });
  });

  it("retrouve la session par l’occurrence annulée", async () => {
    const repository = createRepository({
      getSession: vi.fn(async (id) =>
        id === sessionId ? sessionDetail({ status: "LIVE" }) : null,
      ),
    });

    const session = await cancelSessionQuestion(
      sessionQuestionId,
      actorAdminId,
      { repository },
    );

    expect(session.id).toBe(sessionId);
  });

  it("signale une session publique absente", async () => {
    await expect(
      getPublicSessionState(sessionId, {
        repository: createRepository(),
      }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("transmet uniquement le DTO public préparé par le repository", async () => {
    const publicState: PublicSessionState = {
      session: {
        id: sessionId,
        name: "Grand Quiz de l’Indépendance",
        slug: "grand-quiz-de-l-independance",
        mode: "LIVE",
        status: "LIVE",
        startsAt: now,
        endsAt: null,
      },
      currentQuestion: {
        id: sessionQuestionId,
        position: 1,
        totalQuestions: 10,
        durationSeconds: 45,
        status: "OPEN",
        opensAt: now,
        closesAt: new Date("2026-08-15T18:30:45.000Z"),
        revealedAt: null,
        canceledAt: null,
        acceptingAnswers: true,
        category: { name: "Histoire", slug: "histoire" },
        questionText: "En quelle année le Congo devient-il indépendant ?",
        difficulty: 1,
        mediaType: "TEXT",
        mediaUrl: null,
        options: [
          { id: questionId, label: "A", text: "1960" },
        ],
      },
    };
    const repository = createRepository({
      getPublicState: vi.fn(async () => publicState),
    });

    const state = await getPublicSessionState(sessionId, { repository });

    expect(state).toBe(publicState);
    expect(JSON.stringify(state)).not.toContain("isCorrect");
    expect(JSON.stringify(state)).not.toContain("correctOptionId");
    expect(JSON.stringify(state)).not.toContain("explanation");
  });
});

describe("réouverture du conducteur d’une session prête", () => {
  it("repasse en brouillon une session jamais lancée", async () => {
    const resetToDraft = vi.fn(async () => "transitioned" as const);
    const repository = createRepository({
      resetToDraft,
      getSession: vi.fn(async () => sessionDetail({ status: "DRAFT" })),
    });

    const session = await resetQuizSessionToDraft(sessionId, actorAdminId, { repository });

    expect(resetToDraft).toHaveBeenCalledWith(sessionId, actorAdminId, expect.any(Date));
    expect(session.status).toBe("DRAFT");
  });

  it("refuse de rouvrir une session déjà jouée", async () => {
    const repository = createRepository({
      resetToDraft: vi.fn(async () => "already_played" as const),
    });

    await expect(
      resetQuizSessionToDraft(sessionId, actorAdminId, { repository }),
    ).rejects.toMatchObject({ name: "SessionTransitionError", reason: "already_played" });
  });

  it("refuse de rouvrir une session qui n’est pas prête", async () => {
    const repository = createRepository({
      resetToDraft: vi.fn(async () => "invalid_status" as const),
    });

    await expect(
      resetQuizSessionToDraft(sessionId, actorAdminId, { repository }),
    ).rejects.toMatchObject({ name: "SessionInvalidStatusError" });
  });

  it("refuse une session introuvable", async () => {
    const repository = createRepository({
      resetToDraft: vi.fn(async () => "not_found" as const),
    });

    await expect(
      resetQuizSessionToDraft(sessionId, actorAdminId, { repository }),
    ).rejects.toMatchObject({ name: "SessionNotFoundError" });
  });
});
