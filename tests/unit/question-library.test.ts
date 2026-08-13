import { describe, expect, it, vi } from "vitest";

import {
  CategoryConflictError,
  createCategory,
  createQuestionDraft,
  duplicateQuestion,
  getQuestion,
  normalizeCategorySlug,
  QuestionCategoryNotFoundError,
  QuestionInvalidStatusError,
  type AdminQuestionDetail,
  type PersistQuestionDraft,
  type QuestionLibraryRepository,
  QuestionNotEditableError,
  QuestionNotFoundError,
  QuestionNotReadyError,
  QuestionPersistenceError,
  submitQuestionForReview,
  updateCategory,
  updateQuestionDraft,
  validateQuestion,
} from "../../src/server/services/question-library";

const actorAdminId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const questionId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-08-12T12:00:00.000Z");

const category = {
  id: categoryId,
  name: "Congo–Ghana",
  slug: "congo-ghana",
  description: null,
  active: true,
};

function draftInput() {
  return {
    categoryId,
    questionText: "Quelle ville est la capitale de la République du Congo ?",
    explanation: "Brazzaville est la capitale de la République du Congo.",
    difficulty: 1,
    options: [
      { text: "Brazzaville", isCorrect: true },
      { text: "Pointe-Noire", isCorrect: false },
    ],
    sources: [
      {
        publisher: "République du Congo",
        title: "Présentation du pays",
        url: "https://example.com/republique-du-congo",
        verifiedAt: now,
      },
    ],
  };
}

function detailFromInput(
  input: PersistQuestionDraft,
  status: AdminQuestionDetail["status"] = "DRAFT",
): AdminQuestionDetail {
  return {
    id: input.id,
    category,
    questionText: input.questionText,
    explanation: input.explanation,
    difficulty: input.difficulty,
    status,
    mediaType: input.mediaType,
    mediaUrl: input.mediaUrl,
    createdAt: input.now,
    updatedAt: input.now,
    validatedAt: status === "VALIDATED" ? input.now : null,
    validatedBy: status === "VALIDATED" ? input.actorAdminId : null,
    options: input.options,
    sources: input.sources,
  };
}

function createRepository(
  overrides: Partial<QuestionLibraryRepository> = {},
): QuestionLibraryRepository {
  return {
    createCategory: vi.fn(async (input) => ({
      id: categoryId,
      active: true,
      ...input,
    })),
    listCategories: vi.fn(async () => [category]),
    updateCategory: vi.fn(async (_id, input) => ({
      outcome: "updated" as const,
      category: { id: categoryId, ...input },
    })),
    createQuestion: vi.fn(async (input) => detailFromInput(input)),
    updateQuestion: vi.fn(async (_id, input) => ({
      outcome: "updated" as const,
      question: detailFromInput(input),
    })),
    getAdminQuestion: vi.fn(async () => null),
    listQuestions: vi.fn(async () => []),
    submitForReview: vi.fn(async () => "transitioned" as const),
    validateQuestion: vi.fn(async () => "transitioned" as const),
    archiveQuestion: vi.fn(async () => "transitioned" as const),
    ...overrides,
  };
}

describe("question library service", () => {
  it("normalise le nom de catégorie sans confondre Congo et RDC", () => {
    expect(normalizeCategorySlug("  Congo–Ghana  ")).toBe("congo-ghana");
    expect(normalizeCategorySlug("République du Congo")).toBe(
      "republique-du-congo",
    );
  });

  it("traduit un conflit de catégorie en erreur métier", async () => {
    const repository = createRepository({
      createCategory: vi.fn(async () => {
        throw new QuestionPersistenceError("category_conflict");
      }),
    });

    await expect(
      createCategory({ name: "Histoire" }, repository),
    ).rejects.toBeInstanceOf(CategoryConflictError);
  });

  it("modifie le libellé et l’état actif d’une catégorie", async () => {
    const repository = createRepository();

    const updated = await updateCategory(
      categoryId,
      { name: "Culture congolaise", description: "Arts et patrimoine", active: false },
      repository,
    );

    expect(updated).toMatchObject({
      slug: "culture-congolaise",
      active: false,
    });
    expect(repository.updateCategory).toHaveBeenCalledWith(
      categoryId,
      expect.objectContaining({ slug: "culture-congolaise", active: false }),
    );
  });

  it("attribue les labels A à D et conserve la bonne réponse côté serveur", async () => {
    let persisted: PersistQuestionDraft | undefined;
    let idSequence = 3;
    const repository = createRepository({
      createQuestion: vi.fn(async (input) => {
        persisted = input;
        return detailFromInput(input);
      }),
    });

    const question = await createQuestionDraft(draftInput(), actorAdminId, {
      repository,
      now: () => now,
      createId: () =>
        `00000000-0000-4000-8000-${String(idSequence++).padStart(12, "0")}`,
    });

    expect(question.status).toBe("DRAFT");
    expect(persisted?.actorAdminId).toBe(actorAdminId);
    expect(persisted?.options.map(({ label, position }) => [label, position])).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
    expect(persisted?.options.filter((option) => option.isCorrect)).toHaveLength(
      1,
    );
  });

  it("refuse de modifier une question validée ou archivée", async () => {
    const repository = createRepository({
      updateQuestion: vi.fn(async () => ({
        outcome: "not_editable" as const,
      })),
    });

    await expect(
      updateQuestionDraft(questionId, draftInput(), actorAdminId, {
        repository,
      }),
    ).rejects.toBeInstanceOf(QuestionNotEditableError);
  });

  it("traduit aussi une catégorie absente lors d’une édition", async () => {
    const repository = createRepository({
      updateQuestion: vi.fn(async () => {
        throw new QuestionPersistenceError("category_not_found");
      }),
    });

    await expect(
      updateQuestionDraft(questionId, draftInput(), actorAdminId, {
        repository,
      }),
    ).rejects.toBeInstanceOf(QuestionCategoryNotFoundError);
  });

  it("signale une question absente lors de la consultation", async () => {
    await expect(
      getQuestion(questionId, createRepository()),
    ).rejects.toBeInstanceOf(QuestionNotFoundError);
  });

  it("duplique une question dans un nouveau brouillon traçable", async () => {
    const sourceInput: PersistQuestionDraft = {
      ...draftInput(),
      id: questionId,
      actorAdminId,
      now,
      mediaType: "TEXT",
      mediaUrl: null,
      options: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          label: "A",
          text: "Brazzaville",
          isCorrect: true,
          position: 1,
        },
        {
          id: "00000000-0000-4000-8000-000000000005",
          label: "B",
          text: "Pointe-Noire",
          isCorrect: false,
          position: 2,
        },
      ],
      sources: [
        {
          id: "00000000-0000-4000-8000-000000000006",
          ...draftInput().sources[0],
          notes: null,
        },
      ],
    };
    const source = detailFromInput(sourceInput, "VALIDATED");
    let duplicateInput: PersistQuestionDraft | undefined;
    const repository = createRepository({
      getAdminQuestion: vi.fn(async () => source),
      createQuestion: vi.fn(async (input) => {
        duplicateInput = input;
        return detailFromInput(input);
      }),
    });

    const duplicate = await duplicateQuestion(
      questionId,
      actorAdminId,
      { repository },
    );

    expect(duplicate.status).toBe("DRAFT");
    expect(duplicate.questionText).toContain("(copie)");
    expect(duplicateInput?.sourceQuestionId).toBe(questionId);
  });

  it("bloque la revue d’une question incomplète", async () => {
    const repository = createRepository({
      submitForReview: vi.fn(async () => "incomplete" as const),
    });

    await expect(
      submitQuestionForReview(questionId, actorAdminId, { repository }),
    ).rejects.toMatchObject({
      constructor: QuestionNotReadyError,
      reason: "incomplete",
    });
  });

  it("distingue une transition invalide, une catégorie inactive et une absence", async () => {
    const invalidRepository = createRepository({
      validateQuestion: vi.fn(async () => "invalid_status" as const),
    });
    const inactiveRepository = createRepository({
      validateQuestion: vi.fn(async () => "category_inactive" as const),
    });
    const missingRepository = createRepository({
      validateQuestion: vi.fn(async () => "not_found" as const),
    });

    await expect(
      validateQuestion(questionId, actorAdminId, {
        repository: invalidRepository,
      }),
    ).rejects.toBeInstanceOf(QuestionInvalidStatusError);
    await expect(
      validateQuestion(questionId, actorAdminId, {
        repository: inactiveRepository,
      }),
    ).rejects.toMatchObject({ reason: "category_inactive" });
    await expect(
      validateQuestion(questionId, actorAdminId, {
        repository: missingRepository,
      }),
    ).rejects.toBeInstanceOf(QuestionNotFoundError);
  });
});
