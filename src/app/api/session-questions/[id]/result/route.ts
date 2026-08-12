import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PLAYER_SESSION_COOKIE_NAME } from "@/lib/auth/player-session";
import { getServerEnv } from "@/lib/env/server";
import { postgresAnswerScoringRepository } from "@/server/repositories/answer-scoring-repository";
import {
  AnswerInputError,
  getPlayerAnswerResult,
  PlayerUnauthenticatedError,
  SessionQuestionNotFoundError,
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const playerToken = request.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value;

  if (!playerToken) {
    return errorResponse(401, "UNAUTHENTICATED", "Session joueur requise.");
  }

  try {
    const { id } = await context.params;
    const result = await getPlayerAnswerResult(id, playerToken, {
      repository: postgresAnswerScoringRepository,
      sessionSecret: getServerEnv().SESSION_SECRET,
    });

    return NextResponse.json(result, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof AnswerInputError) {
      return errorResponse(400, "INVALID_QUESTION_ID", "Identifiant invalide.");
    }

    if (error instanceof PlayerUnauthenticatedError) {
      return errorResponse(401, "UNAUTHENTICATED", "Session joueur invalide.");
    }

    if (error instanceof SessionQuestionNotFoundError) {
      return errorResponse(404, "QUESTION_NOT_FOUND", "Question introuvable.");
    }

    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Le résultat n’a pas pu être récupéré.",
    );
  }
}
