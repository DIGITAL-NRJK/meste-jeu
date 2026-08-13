import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE_NAME } from "../../src/lib/auth/admin-session";

const authRepository = vi.hoisted(() => ({ findActiveSession: vi.fn() }));
const questionRepository = vi.hoisted(() => ({
  createCategory: vi.fn(),
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
  getAdminQuestion: vi.fn(),
  listQuestions: vi.fn(),
  submitForReview: vi.fn(),
  validateQuestion: vi.fn(),
  archiveQuestion: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));
vi.mock("@/server/repositories/admin-auth-repository", () => ({
  postgresAdminAuthRepository: authRepository,
}));
vi.mock("@/server/repositories/question-library-repository", () => ({
  postgresQuestionLibraryRepository: questionRepository,
}));

import { GET as getCategories } from "../../src/app/api/admin/categories/route";
import { PUT as updateCategory } from "../../src/app/api/admin/categories/[id]/route";
import {
  GET as listQuestions,
  POST as createQuestion,
} from "../../src/app/api/admin/questions/route";
import {
  DELETE as deleteQuestion,
  GET as getQuestion,
  PUT as updateQuestion,
} from "../../src/app/api/admin/questions/[id]/route";
import { POST as runQuestionAction } from "../../src/app/api/admin/questions/[id]/actions/route";

const adminId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const questionId = "00000000-0000-4000-8000-000000000003";
const cookie = `${ADMIN_SESSION_COOKIE_NAME}=raw-admin-token`;
const now = new Date("2026-08-13T12:00:00.000Z");
const category = {
  id: categoryId,
  name: "Histoire",
  slug: "histoire",
  description: null,
  active: true,
};
const question = {
  id: questionId,
  category,
  questionText: "En quelle année le Congo a-t-il accédé à l’indépendance ?",
  explanation: "La République du Congo est indépendante depuis 1960.",
  difficulty: 1,
  status: "DRAFT" as const,
  mediaType: "TEXT" as const,
  mediaUrl: null,
  createdAt: now,
  updatedAt: now,
  validatedAt: null,
  validatedBy: null,
  options: [
    {
      id: "00000000-0000-4000-8000-000000000004",
      label: "A",
      text: "1960",
      isCorrect: true,
      position: 1,
    },
    {
      id: "00000000-0000-4000-8000-000000000005",
      label: "B",
      text: "1963",
      isCorrect: false,
      position: 2,
    },
  ],
  sources: [
    {
      id: "00000000-0000-4000-8000-000000000006",
      publisher: "République du Congo",
      title: "Histoire de l’indépendance",
      url: "https://example.com/congo-independance",
      verifiedAt: now,
      notes: null,
    },
  ],
};

function request(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", cookie);
  headers.set("Content-Type", "application/json");

  return new NextRequest(url, {
    ...init,
    headers,
  });
}

describe("admin question library API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRepository.findActiveSession.mockResolvedValue({
      id: adminId,
      email: "admin@example.com",
      displayName: "Régie MESTE",
    });
    questionRepository.listQuestions.mockResolvedValue([]);
    questionRepository.listCategories.mockResolvedValue([category]);
    questionRepository.getAdminQuestion.mockResolvedValue(question);
    questionRepository.createQuestion.mockImplementation(async (input) => ({
      ...question,
      id: input.id,
      questionText: input.questionText,
      options: input.options,
      sources: input.sources,
    }));
    questionRepository.updateQuestion.mockImplementation(async (_id, input) => ({
      outcome: "updated",
      question: {
        ...question,
        status: "VALIDATED",
        questionText: input.questionText,
        options: input.options,
        sources: input.sources,
      },
    }));
    questionRepository.deleteQuestion.mockResolvedValue("deleted");
    questionRepository.updateCategory.mockImplementation(async (_id, input) => ({
      outcome: "updated",
      category: { id: categoryId, ...input },
    }));
    questionRepository.validateQuestion.mockResolvedValue("transitioned");
  });

  it("protège la bibliothèque avant toute lecture métier", async () => {
    const response = await listQuestions(
      new NextRequest("http://localhost/api/admin/questions"),
    );

    expect(response.status).toBe(401);
    expect(questionRepository.listQuestions).not.toHaveBeenCalled();
  });

  it("filtre les questions authentifiées et désactive le cache", async () => {
    const response = await listQuestions(
      request(
        `http://localhost/api/admin/questions?status=DRAFT&categoryId=${categoryId}&search=indépendance&limit=25`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(questionRepository.listQuestions).toHaveBeenCalledWith({
      status: "DRAFT",
      categoryId,
      search: "indépendance",
      limit: 25,
    });
  });

  it("crée un brouillon en attribuant l’administrateur authentifié", async () => {
    const response = await createQuestion(
      request("http://localhost/api/admin/questions", {
        method: "POST",
        body: JSON.stringify({
          categoryId,
          questionText: question.questionText,
          explanation: question.explanation,
          difficulty: 1,
          options: question.options.map(({ text, isCorrect }) => ({ text, isCorrect })),
          sources: question.sources.map(({ publisher, title, url, verifiedAt }) => ({
            publisher,
            title,
            url,
            verifiedAt,
          })),
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(questionRepository.createQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ actorAdminId: adminId }),
    );
    await expect(response.json()).resolves.toMatchObject({
      question: { status: "DRAFT" },
    });
  });

  it("réserve le détail incluant la bonne réponse à la route admin", async () => {
    const response = await getQuestion(
      request(`http://localhost/api/admin/questions/${questionId}`),
      { params: Promise.resolve({ id: questionId }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.question.options).toContainEqual(
      expect.objectContaining({ text: "1960", isCorrect: true }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("modifie une question existante sans en créer une copie", async () => {
    const response = await updateQuestion(
      request(`http://localhost/api/admin/questions/${questionId}`, {
        method: "PUT",
        body: JSON.stringify({
          categoryId,
          questionText: "À quelle date le Congo a-t-il accédé à l’indépendance ?",
          explanation: question.explanation,
          difficulty: 1,
          options: question.options.map(({ text, isCorrect }) => ({ text, isCorrect })),
          sources: question.sources.map(({ publisher, title, url, verifiedAt }) => ({
            publisher,
            title,
            url,
            verifiedAt,
          })),
        }),
      }),
      { params: Promise.resolve({ id: questionId }) },
    );

    expect(response.status).toBe(200);
    expect(questionRepository.updateQuestion).toHaveBeenCalledWith(
      questionId,
      expect.objectContaining({ actorAdminId: adminId }),
    );
    expect(questionRepository.createQuestion).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      question: { id: questionId, status: "VALIDATED" },
    });
  });

  it("supprime une question via une commande authentifiée", async () => {
    const response = await deleteQuestion(
      request(`http://localhost/api/admin/questions/${questionId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: questionId }) },
    );

    expect(response.status).toBe(204);
    expect(questionRepository.deleteQuestion).toHaveBeenCalledWith(
      questionId,
      adminId,
      expect.any(Date),
    );
  });

  it("valide une question via une transition métier explicite", async () => {
    const response = await runQuestionAction(
      request(`http://localhost/api/admin/questions/${questionId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "VALIDATE" }),
      }),
      { params: Promise.resolve({ id: questionId }) },
    );

    expect(response.status).toBe(200);
    expect(questionRepository.validateQuestion).toHaveBeenCalledWith(
      questionId,
      adminId,
      expect.any(Date),
    );
  });

  it("liste puis désactive une catégorie sans la supprimer", async () => {
    const listResponse = await getCategories(
      request("http://localhost/api/admin/categories"),
    );
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ categories: [category] });

    const updateResponse = await updateCategory(
      request(`http://localhost/api/admin/categories/${categoryId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Histoire",
          description: "Repères historiques",
          active: false,
        }),
      }),
      { params: Promise.resolve({ id: categoryId }) },
    );

    expect(updateResponse.status).toBe(200);
    expect(questionRepository.updateCategory).toHaveBeenCalledWith(
      categoryId,
      expect.objectContaining({ active: false, slug: "histoire" }),
    );
  });

  it("refuse une action inconnue sans appeler le repository", async () => {
    const response = await runQuestionAction(
      request(`http://localhost/api/admin/questions/${questionId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "PUBLISH" }),
      }),
      { params: Promise.resolve({ id: questionId }) },
    );

    expect(response.status).toBe(400);
    expect(questionRepository.validateQuestion).not.toHaveBeenCalled();
  });
});
