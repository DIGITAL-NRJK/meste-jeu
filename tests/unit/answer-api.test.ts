import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PLAYER_SESSION_COOKIE_NAME } from "../../src/lib/auth/player-session";

const repository = vi.hoisted(() => ({
  submitAnswer: vi.fn(),
  getAnswerResult: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "postgresql://user:password@example.neon.tech/database",
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "session-secret-with-at-least-32-characters",
    ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
  }),
}));

vi.mock("@/server/repositories/answer-scoring-repository", () => ({
  postgresAnswerScoringRepository: repository,
}));

import { POST } from "../../src/app/api/session-questions/[id]/answer/route";
import { GET } from "../../src/app/api/session-questions/[id]/result/route";

const sessionQuestionId = "00000000-0000-4000-8000-000000000001";
const optionId = "00000000-0000-4000-8000-000000000002";
const answerId = "00000000-0000-4000-8000-000000000003";
const correctOptionId = "00000000-0000-4000-8000-000000000004";
const now = new Date("2026-08-15T18:30:00.000Z");
const context = { params: Promise.resolve({ id: sessionQuestionId }) };

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `${PLAYER_SESSION_COOKIE_NAME}=raw-session-token`);

  return new NextRequest(`http://localhost:3000${path}`, {
    ...init,
    headers,
  });
}

describe("answer API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.submitAnswer.mockResolvedValue({
      outcome: "accepted",
      answer: { id: answerId, receivedAt: now, responseTimeMs: 1_500 },
    });
    repository.getAnswerResult.mockResolvedValue({
      outcome: "found",
      result: { status: "CLOSED", answerSubmitted: true },
    });
  });

  it("enregistre une réponse sans révéler correction ni score", async () => {
    const response = await POST(
      request(`/api/session-questions/${sessionQuestionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      }),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.answer).toMatchObject({ id: answerId, responseTimeMs: 1_500 });
    expect(body.answer).not.toHaveProperty("isCorrect");
    expect(body.answer).not.toHaveProperty("points");
  });

  it("refuse une requête sans session joueur avant tout accès PostgreSQL", async () => {
    const response = await POST(
      new NextRequest(`http://localhost:3000/api/session-questions/${sessionQuestionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      }),
      context,
    );

    expect(response.status).toBe(401);
    expect(repository.submitAnswer).not.toHaveBeenCalled();
  });

  it.each([
    ["already_answered", 409, "ANSWER_ALREADY_SUBMITTED"],
    ["invalid_option", 422, "INVALID_OPTION"],
    ["expired", 410, "ANSWER_WINDOW_EXPIRED"],
    ["canceled", 409, "QUESTION_CANCELED"],
    ["not_open", 409, "QUESTION_NOT_OPEN"],
  ] as const)("traduit l’issue %s en HTTP %s", async (outcome, status, code) => {
    repository.submitAnswer.mockResolvedValueOnce({ outcome });

    const response = await POST(
      request(`/api/session-questions/${sessionQuestionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      }),
      context,
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it("masque le résultat tant que la question est CLOSED", async () => {
    const response = await GET(
      request(`/api/session-questions/${sessionQuestionId}/result`),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ status: "CLOSED", answerSubmitted: true });
    expect(body).not.toHaveProperty("correctOptionId");
    expect(body).not.toHaveProperty("explanation");
  });

  it("expose correction, explication et score après REVEALED", async () => {
    repository.getAnswerResult.mockResolvedValueOnce({
      outcome: "found",
      result: {
        status: "REVEALED",
        answerSubmitted: true,
        selectedOptionId: optionId,
        correctOptionId,
        isCorrect: true,
        explanation: "Explication publique après révélation.",
        score: {
          answerPoints: 100,
          difficultyBonus: 40,
          speedBonus: 15,
          streakBonus: 20,
        },
        totalPoints: 175,
      },
    });

    const response = await GET(
      request(`/api/session-questions/${sessionQuestionId}/result`),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "REVEALED",
      correctOptionId,
      isCorrect: true,
      totalPoints: 175,
    });
  });
});
