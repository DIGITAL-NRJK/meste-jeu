import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PLAYER_SESSION_COOKIE_NAME } from "@/lib/auth/player-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAnswerScoringRepository } from "@/server/repositories/answer-scoring-repository";
import {
  AnswerAlreadySubmittedError,
  AnswerInputError,
  AnswerNotAcceptedError,
  AnswerOptionInvalidError,
  PlayerUnauthenticatedError,
  SessionQuestionNotFoundError,
  submitPlayerAnswer,
} from "@/server/services/answer-scoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: noStoreHeaders },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const playerToken = request.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value;

  if (!playerToken) {
    return errorResponse(401, "UNAUTHENTICATED", "Session joueur requise.");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Le corps JSON est invalide.");
  }

  try {
    const { id } = await context.params;
    const answer = await submitPlayerAnswer(id, body, playerToken, {
      repository: postgresAnswerScoringRepository,
      sessionSecret: getServerEnv().SESSION_SECRET,
    });

    return NextResponse.json(
      {
        answer,
        message: "Réponse enregistrée.",
      },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof AnswerInputError) {
      return errorResponse(400, "INVALID_ANSWER", "La réponse est invalide.");
    }

    if (error instanceof PlayerUnauthenticatedError) {
      return errorResponse(401, "UNAUTHENTICATED", "Session joueur invalide.");
    }

    if (error instanceof SessionQuestionNotFoundError) {
      return errorResponse(404, "QUESTION_NOT_FOUND", "Question introuvable.");
    }

    if (error instanceof AnswerOptionInvalidError) {
      return errorResponse(
        422,
        "INVALID_OPTION",
        "Cette proposition n’appartient pas à la question.",
      );
    }

    if (error instanceof AnswerAlreadySubmittedError) {
      return errorResponse(
        409,
        "ANSWER_ALREADY_SUBMITTED",
        "Une réponse a déjà été enregistrée.",
      );
    }

    if (error instanceof AnswerNotAcceptedError) {
      if (error.reason === "expired") {
        return errorResponse(
          410,
          "ANSWER_WINDOW_EXPIRED",
          "Le délai de réponse est terminé.",
        );
      }

      if (error.reason === "canceled") {
        return errorResponse(
          409,
          "QUESTION_CANCELED",
          "Cette question a été annulée.",
        );
      }

      return errorResponse(
        409,
        "QUESTION_NOT_OPEN",
        "Cette question n’est pas ouverte.",
      );
    }

    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "La réponse n’a pas pu être enregistrée.",
    );
  }
}
