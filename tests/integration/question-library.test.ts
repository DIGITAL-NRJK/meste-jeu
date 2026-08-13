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
import {
  archiveQuestion,
  createCategory,
  createQuestionDraft,
  deleteQuestion,
  duplicateQuestion,
  QuestionNotReadyError,
  submitQuestionForReview,
  updateCategory,
  updateQuestion,
  validateQuestion,
} from "../../src/server/services/question-library";

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
const categoryName = `Histoire intégration ${randomUUID()}`;
let categoryId: string | undefined;
const eventId = randomUUID();
const sessionId = randomUUID();

const serviceDependencies = {
  repository: postgresQuestionLibraryRepository,
  now: () => new Date("2026-08-12T14:00:00.000Z"),
};

function completeDraft() {
  if (!categoryId) {
    throw new Error("Integration category was not created");
  }

  return {
    categoryId,
    questionText:
      "En quelle année la République du Congo a-t-elle accédé à l’indépendance ?",
    explanation:
      "La République du Congo a accédé à l’indépendance le 15 août 1960.",
    difficulty: 1,
    options: [
      { text: "1958", isCorrect: false },
      { text: "1960", isCorrect: true },
      { text: "1963", isCorrect: false },
    ],
    sources: [
      {
        publisher: "République du Congo",
        title: "Histoire de l’indépendance",
        url: "https://example.com/integration/congo-independance",
        verifiedAt: new Date("2026-08-12T10:00:00.000Z"),
        notes: "Source de test sur une branche Neon éphémère.",
      },
    ],
  };
}

describe("question library with PostgreSQL", () => {
  beforeAll(async () => {
    await db.insert(adminUsers).values({
      id: actorAdminId,
      email: `integration-question-${randomUUID()}@example.com`,
      passwordHash: "integration-test-only",
      displayName: "Admin intégration questions",
    });

    const category = await createCategory(
      {
        name: categoryName,
        description: "Catégorie temporaire réservée au test d’intégration.",
      },
      postgresQuestionLibraryRepository,
    );
    categoryId = category.id;
  });

  afterAll(async () => {
    if (categoryId) {
      const storedQuestions = await db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.categoryId, categoryId));
      const questionIds = storedQuestions.map((question) => question.id);

      await db.delete(auditLogs).where(eq(auditLogs.adminUserId, actorAdminId));
      await db
        .delete(sessionQuestions)
        .where(eq(sessionQuestions.quizSessionId, sessionId));
      await db.delete(quizSessions).where(eq(quizSessions.id, sessionId));
      await db.delete(events).where(eq(events.id, eventId));

      if (questionIds.length > 0) {
        await db
          .delete(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds));
        await db
          .delete(questionSources)
          .where(inArray(questionSources.questionId, questionIds));
        await db.delete(questions).where(inArray(questions.id, questionIds));
      }

      await db.delete(categories).where(eq(categories.id, categoryId));
    }

    await db.delete(adminUsers).where(eq(adminUsers.id, actorAdminId));
  });

  it("modifie et réactive une catégorie sans perdre son identifiant", async () => {
    if (!categoryId) throw new Error("Integration category was not created");

    const inactive = await updateCategory(
      categoryId,
      {
        name: categoryName,
        description: "Catégorie temporairement inactive.",
        active: false,
      },
      postgresQuestionLibraryRepository,
    );
    expect(inactive).toMatchObject({ id: categoryId, active: false });

    const active = await updateCategory(
      categoryId,
      {
        name: categoryName,
        description: "Catégorie temporaire réservée au test d’intégration.",
        active: true,
      },
      postgresQuestionLibraryRepository,
    );
    expect(active).toMatchObject({ id: categoryId, active: true });
  });

  it("gère le cycle complet sans exposer ni perdre la bonne réponse", async () => {
    const incomplete = await createQuestionDraft(
      {
        ...completeDraft(),
        options: [{ text: "1960", isCorrect: true }],
        sources: [],
      },
      actorAdminId,
      serviceDependencies,
    );

    await expect(
      submitQuestionForReview(
        incomplete.id,
        actorAdminId,
        serviceDependencies,
      ),
    ).rejects.toBeInstanceOf(QuestionNotReadyError);
    await archiveQuestion(incomplete.id, actorAdminId, serviceDependencies);

    const draft = await createQuestionDraft(
      completeDraft(),
      actorAdminId,
      serviceDependencies,
    );

    expect(draft.status).toBe("DRAFT");
    expect(draft.options.map((option) => option.label)).toEqual(["A", "B", "C"]);
    expect(draft.options.filter((option) => option.isCorrect)).toHaveLength(1);

    const review = await submitQuestionForReview(
      draft.id,
      actorAdminId,
      serviceDependencies,
    );
    expect(review.status).toBe("REVIEW");

    const validated = await validateQuestion(
      draft.id,
      actorAdminId,
      serviceDependencies,
    );
    expect(validated).toMatchObject({
      status: "VALIDATED",
      validatedBy: actorAdminId,
    });
    expect(validated.validatedAt).toBeInstanceOf(Date);
    expect(validated.sources).toHaveLength(1);

    const countBeforeEdit = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.categoryId, categoryId!));
    const updated = await updateQuestion(
      validated.id,
      {
        ...completeDraft(),
        questionText:
          "À quelle date la République du Congo a-t-elle accédé à l’indépendance ?",
      },
      actorAdminId,
      serviceDependencies,
    );
    const countAfterEdit = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.categoryId, categoryId!));

    expect(updated).toMatchObject({
      id: validated.id,
      status: "VALIDATED",
      questionText:
        "À quelle date la République du Congo a-t-elle accédé à l’indépendance ?",
    });
    expect(countAfterEdit).toHaveLength(countBeforeEdit.length);

    const duplicate = await duplicateQuestion(
      validated.id,
      actorAdminId,
      serviceDependencies,
    );
    expect(duplicate).toMatchObject({
      status: "DRAFT",
      questionText: expect.stringContaining("(copie)"),
    });
    await deleteQuestion(duplicate.id, actorAdminId, serviceDependencies);
    await expect(
      db.select().from(questions).where(eq(questions.id, duplicate.id)),
    ).resolves.toHaveLength(0);

    const archived = await archiveQuestion(
      validated.id,
      actorAdminId,
      serviceDependencies,
    );
    expect(archived.status).toBe("ARCHIVED");

    const logs = await db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.adminUserId, actorAdminId));

    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        "QUESTION_CREATED",
        "QUESTION_UPDATED",
        "QUESTION_VALIDATED",
      ]),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        action: "QUESTION_CREATED",
        metadata: { sourceQuestionId: validated.id },
      }),
    );
  });

  it("supprime une question d’un conducteur en brouillon et renumérote les autres", async () => {
    const first = await createQuestionDraft(
      {
        ...completeDraft(),
        questionText: "Première question temporaire sur le Congo ?",
      },
      actorAdminId,
      serviceDependencies,
    );
    const second = await createQuestionDraft(
      {
        ...completeDraft(),
        questionText: "Deuxième question temporaire sur le Congo ?",
        sources: completeDraft().sources.map((source) => ({
          ...source,
          url: `${source.url}/deuxieme`,
        })),
      },
      actorAdminId,
      serviceDependencies,
    );

    await db.insert(events).values({
      id: eventId,
      slug: `question-delete-${eventId}`,
      name: "Recette suppression de question",
      startsAt: new Date("2026-08-14T10:00:00.000Z"),
      endsAt: new Date("2026-08-14T12:00:00.000Z"),
      timezone: "Africa/Accra",
      environment: "TEST",
      status: "DRAFT",
    });
    await db.insert(quizSessions).values({
      id: sessionId,
      eventId,
      name: "Conducteur temporaire",
      slug: "conducteur-temporaire",
      mode: "LIVE",
      status: "DRAFT",
    });
    await db.insert(sessionQuestions).values([
      {
        quizSessionId: sessionId,
        questionId: first.id,
        position: 1,
        durationSeconds: 30,
      },
      {
        quizSessionId: sessionId,
        questionId: second.id,
        position: 2,
        durationSeconds: 30,
      },
    ]);

    await deleteQuestion(first.id, actorAdminId, serviceDependencies);

    const remaining = await db
      .select({ questionId: sessionQuestions.questionId, position: sessionQuestions.position })
      .from(sessionQuestions)
      .where(eq(sessionQuestions.quizSessionId, sessionId));
    expect(remaining).toEqual([{ questionId: second.id, position: 1 }]);
  });
});
